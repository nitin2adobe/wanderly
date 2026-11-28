'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAaaAvailability } from '@/components/AaaConsent';
import { createActivationController, recordActivationTrace, type ActivationProvider, type PreparedNudge } from '@/lib/aaa-activation';
import { adobeConnector, CONCIERGE_CLOSE_EVENT, isHiddenConciergeRoute, type ConciergeConnector } from '@/lib/concierge-connector';
import { EVENT_UPDATED } from '@/lib/events';
import { getAaaRuntime } from '@/lib/aaa-runtime';
import { track } from '@/lib/tracking';
import { wanderlyActivation } from '@/sites/wanderly/activation';
import { getCanonicalJourney, getCurrentMoment, evaluateCurrentSuppression, getComparisonSelection, getNudgeExposureCount, NUDGE_SETTINGS_CHANGED } from '@/sites/wanderly/aaa';
import { visitorBriefIsFresh, visitorBriefStore } from '@/lib/aaa-visitor-brief';
import { COMPARISON_SNAPSHOT_REQUEST, comparisonRequest, type ComparisonSnapshot } from '@/lib/aaa-comparison';
import { readAmbientPage } from '@/lib/ambient-context';
import { nudgeWhy } from '@/lib/aaa-nudge-copy';
import { comparisonContext, comparisonSummary, validateComparisonStarter } from '@/sites/wanderly/comparison';
import { createDecisionPoints, isRevisit, type DecisionPoint } from '@/lib/aaa-decision-points';
import { createTimingController } from '@/lib/aaa-timing';
import { readTimingSequence, saveTimingSequence } from '@/lib/aaa-timing-budget';

const agentTiming = process.env.NEXT_PUBLIC_AAA_TIMING === 'agent';

export default function ConciergePlugin({
  connector = adobeConnector, provider = wanderlyActivation, catalogVersion,
}: { connector?: ConciergeConnector; provider?: ActivationProvider; catalogVersion?: string }) {
  const aaa = useAaaAvailability();
  const pathname = usePathname();
  const controller = useMemo(() => createActivationController(provider), [provider]);
  const timing = useMemo(() => createTimingController(provider), [provider]);
  const [nudge, setNudge] = useState<PreparedNudge>();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef(nudge);
  const openingRef = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);
  const balloon = useRef<HTMLElement>(null);
  const attempted = useRef('');
  const exposed = useRef<PreparedNudge | undefined>(undefined);
  const attemptPrepareRef = useRef<() => Promise<void>>(async () => {});
  current.current = nudge;

  useEffect(() => {
    const capture = (event: Event) => {
      if (!('detail' in event) || !event.detail || typeof event.detail !== 'object'
        || !('respond' in event.detail) || typeof event.detail.respond !== 'function') return;
      try {
        if (window.parent === window || window.parent.location.origin !== window.location.origin
          || window.parent.location.pathname !== '/demo/compare') return;
        const availability = getAaaRuntime().get();
        const journey = getCanonicalJourney();
        const moment = getCurrentMoment();
        const suppression = evaluateCurrentSuppression();
        const request = comparisonRequest({
          journey, profile: availability.enabled ? availability.active.profile : undefined, moment, suppression,
        }, crypto.randomUUID(), new Date().toISOString());
        const selection = getComparisonSelection() ?? [];
        const summary = availability.enabled && journey && journey.page.pageType === 'comparison'
          ? comparisonSummary(comparisonContext(journey, availability.active.profile, selection)) : undefined;
        const snapshot: ComparisonSnapshot = {
          ...(request ? { request } : {}),
          page: readAmbientPage(document, window.location, summary),
          selection,
        };
        event.detail.respond(snapshot);
      } catch (error) {
        console.error('[aaa-comparison] snapshot.failed', error);
      }
    };
    window.addEventListener(COMPARISON_SNAPSHOT_REQUEST, capture);
    return () => window.removeEventListener(COMPARISON_SNAPSHOT_REQUEST, capture);
  }, []);

  const clear = () => {
    const focused = balloon.current?.contains(document.activeElement);
    current.current = undefined;
    setNudge(undefined);
    if (focused) document.querySelector<HTMLButtonElement>('.brandConciergeLauncher')?.focus();
  };
  const dismiss = () => {
    const prepared = current.current;
    if (!prepared || openingRef.current) return;
    clear();
    attempted.current = '';
    provider.recordDismissed();
    recordActivationTrace(prepared.request.journey.sessionId, 'dismissed', { reasonCodes: ['activation.visitor_dismissed'] });
  };

  useLayoutEffect(() => {
    if (!nudge || exposed.current === nudge || !balloon.current || !aaa.enabled || isHiddenConciergeRoute(pathname)) return;
    if (!controller.isFresh(nudge, false)) { clear(); return; }
    exposed.current = nudge;
    const shown = provider.recordShown();
    if (!shown.allowed) {
      recordActivationTrace(nudge.request.journey.sessionId, 'suppressed', { suppressionReasons: [...shown.reasonCodes] });
      clear();
      return;
    }
    recordActivationTrace(nudge.request.journey.sessionId, 'shown', { reasonCodes: ['activation.nudge_shown'] });
  }, [nudge, aaa.enabled, pathname, provider, controller]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attemptPrepare = async () => {
      try { await provider.refresh?.(); }
      catch (error) { console.error('[aaa-activation] settings.refresh_failed', error); return; }
      if (!active || current.current || openingRef.current) return;
      const snapshot = provider.read(false);
      if (!snapshot?.allowed || !connector.supportsBrand(snapshot.profile.profileId)) return;
      const key = JSON.stringify([snapshot.journey.sessionId, snapshot.journey.profileVersion, snapshot.journey.page, snapshot.journey.lastSeq, snapshot.momentRuleId]);
      if (attempted.current === key) return;
      attempted.current = key;
      const prepared = await controller.prepare();
      if (!active || !prepared || current.current || openingRef.current || !controller.isFresh(prepared, false)) return;
      const result = validateComparisonStarter(prepared.response.result, comparisonContext(
        prepared.request.journey, snapshot.profile, getComparisonSelection() ?? [],
      ));
      if (!result) return;
      const named = { ...prepared, response: { ...prepared.response, result } };
      if (named.response.visitorBrief) {
        const identity = named.request.journey;
        visitorBriefStore.set(named.response.visitorBrief.text, () => {
          const availability = getAaaRuntime().get();
          const journey = getCanonicalJourney();
          return availability.enabled && !!journey
            && journey.profileId === availability.active.profile.profileId
            && journey.profileVersion === availability.active.profile.profileVersion
            && visitorBriefIsFresh(identity, named.response.result.expiresAt, journey);
        });
      }
      current.current = named;
      setNudge(named);
      setFailed(false);
    };
    attemptPrepareRef.current = attemptPrepare;
    const schedule = () => {
      if (!aaa.enabled || isHiddenConciergeRoute(window.location.pathname) || document.visibilityState === 'hidden') {
        clearTimeout(timer);
        timer = undefined;
        controller.cancel();
        request.current?.abort();
        clear();
        attempted.current = '';
        return;
      }
      if (current.current) {
        if (!controller.isFresh(current.current, true, openingRef.current)) {
          request.current?.abort();
          clear();
        }
        return;
      }
      if (openingRef.current || !connector.openStarters) return;
      if (agentTiming) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void attemptPrepare();
      }, 1200);
    };
    const close = () => schedule();
    const settingsChanged = () => { attempted.current = ''; schedule(); };
    schedule();
    window.addEventListener(EVENT_UPDATED, schedule);
    window.addEventListener('aaa:changed', schedule);
    window.addEventListener('focusin', schedule);
    window.addEventListener('focusout', schedule);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener(CONCIERGE_CLOSE_EVENT, close);
    window.addEventListener(NUDGE_SETTINGS_CHANGED, settingsChanged);
    const unsubscribe = getAaaRuntime().subscribe(schedule);
    const interval = setInterval(schedule, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(interval);
      controller.cancel();
      request.current?.abort();
      unsubscribe();
      window.removeEventListener(EVENT_UPDATED, schedule);
      window.removeEventListener('aaa:changed', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener(CONCIERGE_CLOSE_EVENT, close);
      window.removeEventListener(NUDGE_SETTINGS_CHANGED, settingsChanged);
    };
  }, [aaa.enabled, pathname, provider, connector, controller]);

  useEffect(() => {
    if (!agentTiming || !aaa.enabled) return;
    let storage: Storage;
    try { storage = window.sessionStorage; }
    catch {
      console.warn('[aaa-timing] budget.storage_unavailable');
      return;
    }
    let active = true, syncing = false, preparing = false, session = '', page = '', lastSeq = 0;
    let scheduler: ReturnType<typeof createDecisionPoints> | undefined;
    const unavailable = () => isHiddenConciergeRoute(window.location.pathname)
      || document.visibilityState === 'hidden' || !!current.current || openingRef.current || preparing
      || !!document.querySelector('button[aria-label="Close Wanderly chat"]') || !connector.openStarters;
    const sync = () => {
      if (!active || syncing) return;
      syncing = true;
      try {
        const journey = getCanonicalJourney();
        if (!journey) { scheduler?.pause(); return; }
        if (journey.sessionId !== session) {
          scheduler?.stop();
          session = journey.sessionId; page = ''; lastSeq = 0;
          const initialSequence = readTimingSequence(storage, session);
          if (initialSequence === undefined) {
            scheduler = undefined;
            console.warn('[aaa-timing] budget.storage_unavailable');
            return;
          }
          scheduler = createDecisionPoints({
            now: Date.now, setTimer: (fn, ms) => setTimeout(fn, ms),
            clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
            initialSequence,
            onPoint: point => {
              if (!saveTimingSequence(storage, session, point.sequence)) {
                console.warn('[aaa-timing] budget.storage_unavailable');
                scheduler?.stop();
                return;
              }
              void onPoint(point);
            },
          });
        }
        if (!scheduler) return;
        scheduler!.visible(document.visibilityState !== 'hidden');
        if (unavailable()) scheduler!.pause(); else scheduler!.resume();
        if (journey.page.pageInstanceId !== page) {
          page = journey.page.pageInstanceId; lastSeq = journey.lastSeq;
          scheduler!.pageViewed(page, isRevisit(journey));
        } else if (journey.lastSeq > lastSeq) {
          lastSeq = journey.lastSeq;
          scheduler!.activity(page, isRevisit(journey));
        }
      } finally { syncing = false; }
    };
    const onPoint = async (point: DecisionPoint) => {
      if (!active || unavailable()) return;
      try { await provider.refresh?.(); }
      catch (error) { console.error('[aaa-activation] settings.refresh_failed', error); return; }
      if (!active || unavailable()) return;
      const count = getNudgeExposureCount();
      if (count === undefined) return;
      const entry = await timing.decide(point, count);
      if (!active || !entry || unavailable() || provider.read(false)?.journey.page.pageInstanceId !== point.pageInstanceId) return;
      if (entry.outcome === 'silent' && entry.judgments?.makingProgress === 'yes') scheduler?.standDown(point.pageInstanceId);
      if (entry.outcome !== 'assist') return;
      preparing = true;
      scheduler?.pause();
      try { await attemptPrepareRef.current(); }
      finally { preparing = false; sync(); }
    };
    sync();
    window.addEventListener(EVENT_UPDATED, sync);
    window.addEventListener('aaa:changed', sync);
    window.addEventListener('focusin', sync);
    window.addEventListener('focusout', sync);
    window.addEventListener(CONCIERGE_CLOSE_EVENT, sync);
    document.addEventListener('visibilitychange', sync);
    const unsubscribe = getAaaRuntime().subscribe(sync);
    const interval = setInterval(sync, 2000);
    return () => {
      active = false;
      scheduler?.stop();
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener(EVENT_UPDATED, sync);
      window.removeEventListener('aaa:changed', sync);
      window.removeEventListener('focusin', sync);
      window.removeEventListener('focusout', sync);
      window.removeEventListener(CONCIERGE_CLOSE_EVENT, sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [aaa.enabled, provider, connector, timing]);

  const accept = async () => {
    const prepared = current.current;
    if (!prepared || openingRef.current || !connector.openStarters) return;
    openingRef.current = true;
    setOpening(true);
    const eligible = await controller.isFreshForSend(prepared);
    if (current.current !== prepared || !eligible) {
      openingRef.current = false;
      setOpening(false);
      clear();
      return;
    }
    const abort = new AbortController();
    request.current = abort;
    const activationId = crypto.randomUUID();
    const metadata = { activationId, assistanceType: 'AAA_STARTERS', source: 'visitor', catalogVersion };
    track('ASSISTANCE_REQUESTED', window.location.pathname, undefined, metadata);
    try {
      const result = await connector.openStarters(prepared.response.result, {
        activationId, signal: abort.signal, automatic: false,
        // Focus/chat suppression was checked at click. Once this visitor-requested opening begins,
        // its own chat/focus must not invalidate it; identity, eligibility and expiry still apply.
        stillEligible: () => controller.isFresh(prepared, true, true),
        explanation: 'Choose a question in chat to send it, or type your own. Nothing has been sent for you.',
      });
      recordActivationTrace(prepared.request.journey.sessionId, 'opened', { reasonCodes: [`concierge.${result.status}`] });
      if (result.status !== 'cancelled') {
        track('ASSISTANCE_OPENED', window.location.pathname, undefined, { ...metadata, delivery: result.status });
        track('ASSISTANCE_ACCEPTED', window.location.pathname, undefined, metadata);
      } else {
        track('ASSISTANCE_CANCELLED', window.location.pathname, undefined, { ...metadata, reason: 'activation.ineligible' });
      }
      clear();
    } catch (error) {
      console.error('[aaa-activation] concierge.open_failed', error);
      recordActivationTrace(prepared.request.journey.sessionId, 'failed', { reasonCodes: ['concierge.open_failed'] });
      track('ASSISTANCE_FAILED', window.location.pathname, undefined, { ...metadata, phase: 'opening', reason: 'concierge.open_failed' });
      // No automatic replay, including after an uncertain SDK acknowledgement.
      clear();
      setFailed(true);
    } finally {
      if (request.current === abort) request.current = undefined;
      openingRef.current = false;
      setOpening(false);
    }
  };

  if (!aaa.enabled || isHiddenConciergeRoute(pathname)) return null;
  const primary = nudge?.response.result.starters.find(starter => starter.role === 'primary');
  return <>
    <div className="aaaLiveStatus" role="status" aria-live="polite" aria-atomic="true">
      {nudge ? 'Optional help is available. You can open chat or dismiss the suggestion.' : failed ? 'Suggested help could not open. You can still use the chat button.' : ''}
    </div>
    {failed && <aside className="conciergeBalloon aaaNudge" role="alert">
      <p>Suggested help could not open. Use the chat button to continue manually; no question will be resent.</p>
      <button type="button" className="btn ghost" onClick={() => setFailed(false)}>Dismiss</button>
    </aside>}
    {nudge && primary && <aside ref={balloon} className="conciergeBalloon aaaNudge" aria-labelledby="aaa-nudge-title" aria-busy={opening} onKeyDown={event => {
      if (event.key === 'Escape' && !openingRef.current) { event.stopPropagation(); dismiss(); }
    }}>
      <h3 id="aaa-nudge-title">{nudge.response.headline?.text ?? 'A little help choosing?'}</h3>
      <p>{primary.text}</p>
      <details className="conciergeWhy">
        <summary>Why am I seeing this?</summary>
        <p>{nudgeWhy(nudge.response.why?.text)}</p>
      </details>
      <div className="conciergeActions">
        <button type="button" className="btn" disabled={opening} onClick={() => void accept()}>{opening ? 'Opening chat...' : 'Open chat'}</button>
        <button type="button" className="btn ghost" disabled={opening} onClick={dismiss}>Not now</button>
      </div>
    </aside>}
  </>;
}
