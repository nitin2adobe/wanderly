'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { assistanceCopy } from '@/lib/assistance-copy';
import { evaluatePolicy, hasPendingInvitation, isForwardProgress } from '@/lib/assistance-policy';
import { buildHandoff, validateHandoff, type ConciergeHandoff } from '@/lib/concierge-handoff';
import { EVENT_UPDATED } from '@/lib/events';
import { buildJourneyContext } from '@/lib/journey-context';
import { getActivationMode, ACTIVATION_MODE_CHANGED } from '@/lib/activation-mode';
import { proposeAssistance } from '@/lib/activation-proposal';
import { getPolicyOptions, POLICY_SETTINGS_CHANGED } from '@/lib/policy-settings';
import { brandIdForPath, getBrandConfig } from '@/lib/brand-config';
import { deriveMemory } from '@/lib/assistance-memory';
import { getEvents, getSessionId, track } from '@/lib/tracking';
import MockConciergePanel from './MockConciergePanel';
import { CONCIERGE_OPEN_EVENT, demoConnector, type ConciergeConnector } from '@/lib/concierge-connector';

const EVALUATION_DELAY_MS = 1200;
const HIDDEN_ROUTES = ['/agent', '/booking'];
// Demo control pages host the site in an iframe, so the plugin runs inside the frame instead.
const HIDDEN_EXACT = ['/demo', '/demo/live'];
const isHiddenRoute = (pathname: string | null) =>
  !!pathname && (HIDDEN_EXACT.includes(pathname) || HIDDEN_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`)));

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
    // Never create (or count) an invitation the visitor cannot see.
    if (isHiddenRoute(window.location.pathname)) return;
    const { sid, events } = sessionEvents();
    if (!sid) return;
    const pending = hasPendingInvitation(events);
    const current = invitationRef.current;

    if (current) {
      // Withdraw on forward progress or a reset session. This check is source-independent: an invitation proposed by
      // the AI must not be judged against the rules' decision.
      if (!pending) setInvitation(null);
      else if (isForwardProgress(buildJourneyContext(events))) {
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
    const policy = evaluatePolicy(decision, context, latest.events, new Date(), getPolicyOptions());
    if (!policy.allowed) return;
    const memory = deriveMemory(latest.events);
    const handoff = buildHandoff(context, decision, sid, new Date(), brandIdForPath(window.location.pathname), memory.preferredPriority ? { priority: memory.preferredPriority } : {});
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
    window.addEventListener(POLICY_SETTINGS_CHANGED, schedule);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener(EVENT_UPDATED, schedule);
      window.removeEventListener('storage', schedule);
      window.removeEventListener(ACTIVATION_MODE_CHANGED, schedule);
      window.removeEventListener(POLICY_SETTINGS_CHANGED, schedule);
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
      // Escape must not silently dismiss an invitation that is hidden on this route.
      if (event.key !== 'Escape' || !current || isHiddenRoute(window.location.pathname)) return;
      track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.intent, reason: 'visitor' });
      setInvitation(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (isHiddenRoute(pathname)) return null;

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

  const brand = invitation ? getBrandConfig(invitation.brand) : undefined;
  const copy = invitation ? assistanceCopy(invitation.intent, invitation.entities, brand) : null;
  return (
    <>
      {invitation && copy && (
        <div className="conciergeBalloon" role="dialog" aria-label="Concierge suggestion">
          <div className="conciergeBalloonHead"><span className="conciergeAvatar" aria-hidden="true">{(brand?.displayName ?? 'B').charAt(0)}</span><strong>{brand?.displayName ?? 'Brand'} concierge</strong></div>
          <h3>{copy.headline}</h3>
          <p>{copy.body}</p>
          {invitation.observedSignals.length > 0 && (
            <details className="conciergeWhy">
              <summary>Why am I seeing this?</summary>
              <ul>{invitation.observedSignals.map(signal => <li key={signal}>{signal}</li>)}</ul>
            </details>
          )}
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
