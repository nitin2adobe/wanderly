'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { assistanceCopy } from '@/lib/assistance-copy';
import { evaluatePolicy, hasPendingInvitation, isForwardProgress } from '@/lib/assistance-policy';
import { conciergeOpeningMessage } from '@/lib/concierge-message';
import { conciergePageDestination, contextualHandoff } from '@/lib/concierge-context';
import { getComparisonSlugs } from '@/components/DestinationComparison';
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

export default function ConciergePlugin({ connector = adobeConnector, catalogVersion }: { connector?: ConciergeConnector; catalogVersion?: string }) {
  const pathname = usePathname();
  const [invitation, setInvitation] = useState<ConciergeHandoff | null>(null);
  const [failedInvitation, setFailedInvitation] = useState<ConciergeHandoff | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invitationRef = useRef(invitation);
  const automaticHandoff = useRef<{ handoff: ConciergeHandoff; activationId: string } | null>(null);
  const activeRequest = useRef<{ controller: AbortController; sessionId: string; activationId: string; brand: string; activationMode?: ReturnType<typeof getActivationMode> } | null>(null);
  const [opening, setOpening] = useState(false);
  invitationRef.current = invitation;

  const triggerChat = useCallback(async (handoff: ConciergeHandoff, accepted = false, source = 'unknown') => {
    if (activeRequest.current) return;
    const events = sessionEvents().events;
    const destination = conciergePageDestination(window.location.pathname, window.location.search);
    handoff = contextualHandoff(handoff, events, getComparisonSlugs(), destination?.slug);
    const initialMessage = conciergeOpeningMessage(handoff, destination ? [destination.name] : buildJourneyContext(events).destinationsViewed);
    const request = { controller: new AbortController(), sessionId: handoff.sessionId, activationId: crypto.randomUUID(), brand: handoff.brand, activationMode: accepted ? undefined : getActivationMode() };
    activeRequest.current = request;
    setOpening(true);
    track('ASSISTANCE_REQUESTED', window.location.pathname, undefined, { assistanceType: handoff.intent, activationId: request.activationId, handoff, source, catalogVersion });
    try {
      const result = await connector.open(handoff, {
        initialMessage, signal: request.controller.signal, activationId: request.activationId, automatic: !accepted,
        explanation: 'A suggested question from your current trip choices. Choose it in chat, or copy it into an existing conversation.',
      });
      if (getSessionId() !== handoff.sessionId) return;
      const metadata = { assistanceType: handoff.intent, activationId: request.activationId, handoff, source, catalogVersion };
      if (result.status === 'cancelled' || request.controller.signal.aborted) {
        track('ASSISTANCE_CANCELLED', window.location.pathname, undefined, { ...metadata, reason: 'obsolete-or-closed' });
        setInvitation(null);
        return;
      }
      track('ASSISTANCE_SHOWN', window.location.pathname, undefined, metadata);
      track('ASSISTANCE_OPENED', window.location.pathname, undefined, { ...metadata, delivery: result.status, source: accepted ? 'visitor-retry' : 'automatic' });
      if (result.status === 'submitted') track('ASSISTANCE_TRIGGERED', window.location.pathname, undefined, metadata);
      if (accepted) track('ASSISTANCE_ACCEPTED', window.location.pathname, undefined, metadata);
      automaticHandoff.current = { handoff, activationId: request.activationId };
      setInvitation(null);
      setFailedInvitation(null);
    } catch (error) {
      console.error('Unable to open Brand Concierge automatically:', error);
      if (getSessionId() !== handoff.sessionId) return;
      track('ASSISTANCE_FAILED', window.location.pathname, undefined, { assistanceType: handoff.intent, activationId: request.activationId, phase: 'opening', reason: 'acknowledgement-failed' });
      setInvitation(handoff);
      setFailedInvitation(handoff);
    } finally {
      if (activeRequest.current === request) activeRequest.current = null;
      setOpening(false);
    }
  }, [connector, catalogVersion]);

  const evaluate = useCallback(async () => {
    // Never create (or count) an invitation the visitor cannot see.
    if (isHiddenRoute(window.location.pathname)) return;
    const { sid, events } = sessionEvents();
    if (!sid) return;
    if (activeRequest.current) return;
    const pending = hasPendingInvitation(events);
    const current = invitationRef.current;

    if (current && current.sessionId !== sid) {
      invitationRef.current = null;
      setInvitation(null);
      setFailedInvitation(null);
    } else if (current) {
      // Withdraw on forward progress or a reset session. This check is source-independent: an invitation proposed by
      // the AI must not be judged against the rules' decision.
      if (isForwardProgress(buildJourneyContext(events))) {
        track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.intent, reason: 'withdrawn' });
        setInvitation(null);
      }
      return;
    }

    if (pending) {
      // Restore an invitation that survived a page reload.
      const last = [...events].reverse().find(e => e.eventType === 'ASSISTANCE_SHOWN' || e.eventType === 'ASSISTANCE_REQUESTED');
      const restored = validateHandoff(last?.metadata?.handoff);
      if (restored.valid) {
        // A reload cannot establish whether the SDK submitted. Offer a manual continuation, never replay automatically.
        if (last?.eventType === 'ASSISTANCE_REQUESTED') track('ASSISTANCE_CANCELLED', window.location.pathname, undefined, { assistanceType: restored.value.intent, activationId: last.metadata?.activationId, reason: 'interrupted-request' });
        setInvitation(restored.value);
      }
      else track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: last?.metadata?.assistanceType, reason: 'unrestorable' });
      return;
    }

    const context = buildJourneyContext(events);
    const mode = getActivationMode();
    const { decision, source } = await proposeAssistance(context, mode === 'ai');
    // The journey may have moved on while the reasoner was thinking; a newer evaluation is already scheduled.
    const latest = sessionEvents();
    if (isHiddenRoute(window.location.pathname) || getActivationMode() !== mode || latest.sid !== sid || JSON.stringify(buildJourneyContext(latest.events)) !== JSON.stringify(context) || invitationRef.current || hasPendingInvitation(latest.events)) return;
    const policy = evaluatePolicy(decision, context, latest.events, new Date(), getPolicyOptions());
    track('ASSISTANCE_EVALUATED', window.location.pathname, undefined, { decision, source, activationMode: mode, contextKey: JSON.stringify(context), policy });
    if (!policy.allowed) return;
    const memory = deriveMemory(latest.events);
    const handoff = contextualHandoff(buildHandoff(context, decision, sid, new Date(), brandIdForPath(window.location.pathname), memory.preferredPriority ? { priority: memory.preferredPriority } : {}), latest.events, getComparisonSlugs());
    if (connector.supportsBrand(handoff.brand)) void triggerChat(handoff, false, source);
    else {
      track('ASSISTANCE_SHOWN', window.location.pathname, undefined, { assistanceType: handoff.intent, handoff, source });
      setInvitation(handoff);
    }
  }, [connector, triggerChat]);

  useEffect(() => {
    const schedule = (event?: Event) => {
      const request = activeRequest.current;
      if (request && (getSessionId() !== request.sessionId || isHiddenRoute(window.location.pathname) || brandIdForPath(window.location.pathname) !== request.brand || (request.activationMode !== undefined && getActivationMode() !== request.activationMode) || isForwardProgress(buildJourneyContext(sessionEvents().events)))) request.controller.abort();
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (typeof detail?.eventType === 'string' && detail.eventType.startsWith('ASSISTANCE_') && detail.eventType !== 'ASSISTANCE_PREFERENCE') return;
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
  }, [evaluate, pathname]);

  useEffect(() => () => activeRequest.current?.controller.abort(), []);

  useEffect(() => {
    const onClose = () => {
      activeRequest.current?.controller.abort();
      const current = automaticHandoff.current;
      automaticHandoff.current = null;
      if (!current || current.handoff.sessionId !== getSessionId()) return;
      track('ASSISTANCE_DISMISSED', window.location.pathname, undefined, { assistanceType: current.handoff.intent, activationId: current.activationId, reason: 'visitor' });
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
    void triggerChat(invitation, true);
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
            {chatAvailable && <button className="btn" disabled={opening} onClick={accept}>{opening ? 'Opening chat...' : failedInvitation === invitation ? 'Retry opening chat' : copy.cta}</button>}
            <button className="btn ghost" disabled={opening} onClick={dismiss}>{copy.dismiss}</button>
          </div>
          {failedInvitation === invitation && <p role="alert">Chat couldn't be opened. Try again or reload the page.</p>}
        </div>
      )}
    </>
  );
}
