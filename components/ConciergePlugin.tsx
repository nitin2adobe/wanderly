'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { decideAssistance } from '@/lib/assistance-decision';
import { assistanceCopy } from '@/lib/assistance-copy';
import { evaluatePolicy, hasPendingInvitation } from '@/lib/assistance-policy';
import { buildHandoff, validateHandoff, type ConciergeHandoff } from '@/lib/concierge-handoff';
import { EVENT_UPDATED } from '@/lib/events';
import { buildJourneyContext } from '@/lib/journey-context';
import { getActivationMode, ACTIVATION_MODE_CHANGED } from '@/lib/activation-mode';
import { proposeAssistance } from '@/lib/activation-proposal';
import { getEvents, getSessionId, track } from '@/lib/tracking';
import MockConciergePanel from './MockConciergePanel';
import { CONCIERGE_OPEN_EVENT, demoConnector, type ConciergeConnector } from '@/lib/concierge-connector';

const EVALUATION_DELAY_MS = 1200;
const HIDDEN_ROUTES = ['/agent', '/booking', '/demo'];

function sessionEvents() {
  const sid = getSessionId();
  return { sid, events: getEvents().filter(e => e.sessionId === sid) };
}

export default function ConciergePlugin({ connector = demoConnector }: { connector?: ConciergeConnector }) {
  const pathname = usePathname();
  const [invitation, setInvitation] = useState<ConciergeHandoff | null>(null);
  const [panelHandoff, setPanelHandoff] = useState<ConciergeHandoff | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invitationRef = useRef(invitation);
  invitationRef.current = invitation;

  const evaluate = useCallback(async () => {
    const { sid, events } = sessionEvents();
    if (!sid) return;
    const pending = hasPendingInvitation(events);
    const current = invitationRef.current;

    if (current) {
      // The invitation is stale if the session was reset or the journey no longer warrants it.
      const still = decideAssistance(buildJourneyContext(events));
      if (!pending) setInvitation(null);
      else if (still.decision !== 'ASSIST' || still.assistanceType !== current.intent) {
        track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.intent, reason: 'withdrawn' });
        setInvitation(null);
      }
      return;
    }

    if (pending) {
      // Restore an invitation that survived a page reload.
      const last = [...events].reverse().find(e => e.eventType === 'ASSISTANCE_SHOWN');
      const restored = validateHandoff(last?.metadata?.handoff);
      if (restored.valid) setInvitation(restored.value);
      else track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: last?.metadata?.assistanceType, reason: 'unrestorable' });
      return;
    }

    const context = buildJourneyContext(events);
    const mode = getActivationMode();
    const { decision, source } = await proposeAssistance(context, mode === 'ai');
    // The journey may have moved on while the reasoner was thinking; a newer evaluation is already scheduled.
    const latest = sessionEvents();
    if (JSON.stringify(buildJourneyContext(latest.events)) !== JSON.stringify(context) || invitationRef.current || hasPendingInvitation(latest.events)) return;
    const policy = evaluatePolicy(decision, context, latest.events, new Date());
    if (!policy.allowed) return;
    const handoff = buildHandoff(context, decision, sid);
    track('ASSISTANCE_SHOWN', window.location.pathname, undefined, { assistanceType: handoff.intent, handoff, source });
    setInvitation(handoff);
  }, []);

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(evaluate, EVALUATION_DELAY_MS);
    };
    schedule();
    window.addEventListener(EVENT_UPDATED, schedule);
    window.addEventListener('storage', schedule);
    window.addEventListener(ACTIVATION_MODE_CHANGED, schedule);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener(EVENT_UPDATED, schedule);
      window.removeEventListener('storage', schedule);
      window.removeEventListener(ACTIVATION_MODE_CHANGED, schedule);
    };
  }, [evaluate]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const handoff = validateHandoff((event as CustomEvent).detail);
      if (handoff.valid) setPanelHandoff(handoff.value);
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = invitationRef.current;
      if (event.key !== 'Escape' || !current) return;
      track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.intent, reason: 'visitor' });
      setInvitation(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (HIDDEN_ROUTES.some(route => pathname === route || pathname?.startsWith(`${route}/`))) return null;

  const accept = () => {
    if (!invitation) return;
    track('ASSISTANCE_ACCEPTED', window.location.pathname, undefined, { assistanceType: invitation.intent, handoff: invitation });
    connector.open(invitation);
    setInvitation(null);
  };
  const dismiss = () => {
    if (!invitation) return;
    track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: invitation.intent, reason: 'visitor' });
    setInvitation(null);
  };

  const copy = invitation ? assistanceCopy(invitation.intent, invitation.entities) : null;
  return (
    <>
      {invitation && copy && (
        <div className="conciergeBalloon" role="dialog" aria-label="Concierge suggestion">
          <div className="conciergeBalloonHead"><span className="conciergeAvatar" aria-hidden="true">W</span><strong>Wanderly concierge</strong></div>
          <h3>{copy.headline}</h3>
          <p>{copy.body}</p>
          <div className="conciergeActions">
            <button className="btn" onClick={accept}>{copy.cta}</button>
            <button className="btn ghost" onClick={dismiss}>{copy.dismiss}</button>
          </div>
        </div>
      )}
      {panelHandoff && (
        <MockConciergePanel
          initialHandoff={panelHandoff}
          onClose={() => setPanelHandoff(null)}
          onPreference={priority => track('ASSISTANCE_PREFERENCE', window.location.pathname, undefined, { assistanceType: panelHandoff.intent, priority })}
        />
      )}
    </>
  );
}
