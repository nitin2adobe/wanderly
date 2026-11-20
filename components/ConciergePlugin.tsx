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
import { adobeConnector, CONCIERGE_CLOSE_EVENT, isHiddenConciergeRoute as isHiddenRoute, type ConciergeConnector } from '@/lib/concierge-connector';

const EVALUATION_DELAY_MS = 1200;
function sessionEvents() {
  const sid = getSessionId();
  return { sid, events: getEvents().filter(e => e.sessionId === sid) };
}

export default function ConciergePlugin({ connector = adobeConnector }: { connector?: ConciergeConnector }) {
  const pathname = usePathname();
  const [invitation, setInvitation] = useState<ConciergeHandoff | null>(null);
  const [failedInvitation, setFailedInvitation] = useState<ConciergeHandoff | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invitationRef = useRef(invitation);
  const automaticHandoff = useRef<ConciergeHandoff | null>(null);
  invitationRef.current = invitation;

  const triggerChat = useCallback((handoff: ConciergeHandoff) => {
    try {
      connector.open(handoff, { initialMessage: 'Hi' });
    } catch (error) {
      console.error('Unable to open Brand Concierge automatically:', error);
      setInvitation(handoff);
      setFailedInvitation(handoff);
      return;
    }
    track('ASSISTANCE_TRIGGERED', window.location.pathname, undefined, { assistanceType: handoff.intent, handoff, initialMessage: 'Hi' });
    automaticHandoff.current = handoff;
    setInvitation(null);
  }, [connector]);

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
      if (restored.valid) {
        if (restored.value.brand === brandIdForPath(window.location.pathname) && connector.supportsBrand(restored.value.brand)) triggerChat(restored.value);
        else setInvitation(restored.value);
      }
      else track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: last?.metadata?.assistanceType, reason: 'unrestorable' });
      return;
    }

    const context = buildJourneyContext(events);
    const mode = getActivationMode();
    const { decision, source } = await proposeAssistance(context, mode === 'ai');
    // The journey may have moved on while the reasoner was thinking; a newer evaluation is already scheduled.
    const latest = sessionEvents();
    if (isHiddenRoute(window.location.pathname) || latest.sid !== sid || JSON.stringify(buildJourneyContext(latest.events)) !== JSON.stringify(context) || invitationRef.current || hasPendingInvitation(latest.events)) return;
    const policy = evaluatePolicy(decision, context, latest.events, new Date(), getPolicyOptions());
    if (!policy.allowed) return;
    const memory = deriveMemory(latest.events);
    const handoff = buildHandoff(context, decision, sid, new Date(), brandIdForPath(window.location.pathname), memory.preferredPriority ? { priority: memory.preferredPriority } : {});
    track('ASSISTANCE_SHOWN', window.location.pathname, undefined, { assistanceType: handoff.intent, handoff, source });
    if (connector.supportsBrand(handoff.brand)) triggerChat(handoff);
    else setInvitation(handoff);
  }, [connector, triggerChat]);

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
    const onClose = () => {
      const current = automaticHandoff.current;
      automaticHandoff.current = null;
      if (!current || current.sessionId !== getSessionId()) return;
      track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.intent, reason: 'visitor' });
    };
    window.addEventListener(CONCIERGE_CLOSE_EVENT, onClose);
    return () => window.removeEventListener(CONCIERGE_CLOSE_EVENT, onClose);
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
    try {
      connector.open(invitation);
    } catch (error) {
      console.error('Unable to open Brand Concierge:', error);
      setFailedInvitation(invitation);
      return;
    }
    track('ASSISTANCE_ACCEPTED', window.location.pathname, undefined, { assistanceType: invitation.intent, handoff: invitation });
    setInvitation(null);
  };
  const dismiss = () => {
    if (!invitation) return;
    track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: invitation.intent, reason: 'visitor' });
    setInvitation(null);
  };

  const brand = invitation ? getBrandConfig(invitation.brand) : undefined;
  const copy = invitation ? assistanceCopy(invitation.intent, invitation.entities, brand) : null;
  const isCurrentBrand = invitation?.brand === brandIdForPath(pathname);
  const chatAvailable = !!invitation && isCurrentBrand && connector.supportsBrand(invitation.brand);
  return (
    <>
      {invitation && copy && (
        <div className="conciergeBalloon" role="dialog" aria-label="Concierge suggestion">
          <div className="conciergeBalloonHead"><span className="conciergeAvatar" aria-hidden="true">{(brand?.displayName ?? 'B').charAt(0)}</span><strong>{brand?.displayName ?? 'Brand'} concierge</strong></div>
          <h3>{copy.headline}</h3>
          <p>{chatAvailable ? `${copy.body} Share your question in the chat.` : isCurrentBrand ? `Live chat isn't configured for ${brand?.displayName ?? 'this brand'}.` : 'This suggestion is not available on this page.'}</p>
          {invitation.observedSignals.length > 0 && (
            <details className="conciergeWhy">
              <summary>Why am I seeing this?</summary>
              <ul>{invitation.observedSignals.map(signal => <li key={signal}>{signal}</li>)}</ul>
            </details>
          )}
          <div className="conciergeActions">
            {chatAvailable && <button className="btn" onClick={accept}>{copy.cta}</button>}
            <button className="btn ghost" onClick={dismiss}>{copy.dismiss}</button>
          </div>
          {failedInvitation === invitation && <p role="alert">Chat couldn't be opened. Try again or reload the page.</p>}
        </div>
      )}
    </>
  );
}
