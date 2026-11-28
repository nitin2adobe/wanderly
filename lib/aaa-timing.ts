import { validateContract } from '../aaa/contracts/validate.ts';
import type { ActivationProvider, ActivationSnapshot } from './aaa-activation.ts';
import type { DecisionPoint } from './aaa-decision-points.ts';
import { destinations, packages, getDestination, getPackage } from './data.ts';

export type TimingEntry = {
  at: number; startedAt: number; sessionId: string; point: DecisionPoint; pageType: string; entityNames: string[];
  outcome: 'assist' | 'silent' | 'blocked' | 'pending';
  source: 'agent' | 'safeguard' | 'rules.fallback' | 'agent.failed';
  reasonCodes: string[]; rulesWouldAssist: boolean; traceId?: string; elapsedMs?: number;
  judgments?: { welcomeNow: string; makingProgress: string; stuck: string }; confidence?: string;
};
export const AAA_TIMING_CHANGED = 'aaa:timing';
const entries: TimingEntry[] = [];
type TimingSession = { failures: number; fallback: boolean; running: boolean; seen: Set<string>; queued?: {
  start: () => Promise<TimingEntry | undefined>; resolve: (value: TimingEntry | undefined) => void;
} };
const sessions = new Map<string, TimingSession>();
const reasonCodes = new Set([
  'signal.back_and_forth', 'signal.revisit', 'signal.compared', 'signal.long_stay', 'signal.price_focus',
  'signal.info_seeking', 'signal.preference_set', 'progress.single_focus', 'engagement.new_visit', 'engagement.low',
  'timing.model_failed', 'timing.unsupported_assist', 'timing.no_supported_reason', 'timing.rate_limited',
  'transaction.active', 'transaction.uncertain', 'moment.not_eligible', 'moment.not_assist',
  'consent.pending', 'consent.denied', 'profile.unavailable', 'profile.policy_violation', 'journey.unavailable',
  'journey.uncertain', 'chat.active', 'form.focused', 'exposure.dismissed', 'exposure.limit',
  'exposure.cooldown', 'comparison.invalid_selection',
]);

function emit(entry: TimingEntry) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AAA_TIMING_CHANGED));
  if (window.parent !== window) {
    try {
      if (window.parent.location.origin === window.location.origin && window.parent.location.pathname === '/demo/live') {
        window.parent.dispatchEvent(new CustomEvent(AAA_TIMING_CHANGED, { detail: structuredClone(entry) }));
      }
    } catch (cause) {
      console.warn('[aaa-timing] timeline.parent_unavailable', cause instanceof Error ? cause.name : 'unknown');
    }
  }
}
function removePending(sessionId: string, point: DecisionPoint) {
  const index = entries.findIndex(item => item.sessionId === sessionId && item.point.sequence === point.sequence
    && item.point.pageInstanceId === point.pageInstanceId);
  if (index >= 0) entries.splice(index, 1);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AAA_TIMING_CHANGED));
  try {
    if (window.parent !== window && window.parent.location.origin === window.location.origin
      && window.parent.location.pathname === '/demo/live') {
      window.parent.dispatchEvent(new CustomEvent(AAA_TIMING_CHANGED, { detail: { remove: { sessionId, point } } }));
    }
  } catch (cause) {
    console.warn('[aaa-timing] timeline.parent_unavailable', cause instanceof Error ? cause.name : 'unknown');
  }
}
function record(entry: TimingEntry) {
  const index = entries.findIndex(item => item.sessionId === entry.sessionId && item.point.sequence === entry.point.sequence
    && item.point.pageInstanceId === entry.point.pageInstanceId);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  while (entries.length > 50) entries.shift();
  emit(entry);
}
export const timingTimeline = (sessionId: string) => entries.filter(entry => entry.sessionId === sessionId);

export function acceptFrameTimingEntry(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  if ('remove' in value && value.remove && typeof value.remove === 'object'
    && 'sessionId' in value.remove && typeof value.remove.sessionId === 'string'
    && 'point' in value.remove && value.remove.point && typeof value.remove.point === 'object'
    && 'sequence' in value.remove.point && typeof value.remove.point.sequence === 'number'
    && 'pageInstanceId' in value.remove.point && typeof value.remove.point.pageInstanceId === 'string') {
    const { sessionId, point } = value.remove;
    const { sequence, pageInstanceId } = point;
    const index = entries.findIndex(item => item.sessionId === sessionId
      && item.point.sequence === sequence && item.point.pageInstanceId === pageInstanceId);
    if (index >= 0) entries.splice(index, 1);
    return;
  }
  const entry = value as Partial<TimingEntry>;
  if (typeof entry.sessionId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(entry.sessionId)
    || !entry.point || !['page_settled', 'activity_paused', 'long_stay', 'revisit'].includes(entry.point.kind)
    || !Number.isSafeInteger(entry.point.sequence) || !Number.isSafeInteger(entry.point.pageSequence)
    || entry.point.sequence < 1 || entry.point.sequence > 100 || entry.point.pageSequence < 1 || entry.point.pageSequence > 4
    || typeof entry.point.pageInstanceId !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(entry.point.pageInstanceId)
    || typeof entry.at !== 'number' || !Number.isFinite(entry.at)
    || typeof entry.startedAt !== 'number' || !Number.isFinite(entry.startedAt)
    || typeof entry.pageType !== 'string' || !/^[a-z0-9-]{1,64}$/.test(entry.pageType)
    || !['assist', 'silent', 'blocked', 'pending'].includes(entry.outcome ?? '')
    || !['agent', 'safeguard', 'rules.fallback', 'agent.failed'].includes(entry.source ?? '')
    || typeof entry.rulesWouldAssist !== 'boolean'
    || !Array.isArray(entry.reasonCodes) || entry.reasonCodes.length > 10 || entry.reasonCodes.some(code => !reasonCodes.has(code))
    || !Array.isArray(entry.entityNames) || entry.entityNames.length > 2 || entry.entityNames.some(name =>
      !destinations.some(item => item.name === name) && !packages.some(item => item.packageName === name))) return;
  if (entry.judgments && (typeof entry.judgments !== 'object'
    || !['yes', 'no', 'unsure'].includes(entry.judgments.welcomeNow)
    || !['yes', 'no', 'unsure'].includes(entry.judgments.makingProgress)
    || !['yes', 'no', 'unsure'].includes(entry.judgments.stuck))) return;
  if (entry.confidence && !['low', 'medium', 'high'].includes(entry.confidence)) return;
  const safe: TimingEntry = {
    sessionId: entry.sessionId, point: {
      kind: entry.point.kind, sequence: entry.point.sequence,
      pageSequence: entry.point.pageSequence, pageInstanceId: entry.point.pageInstanceId,
    }, at: entry.at, startedAt: entry.startedAt, pageType: entry.pageType,
    entityNames: entry.entityNames.slice(0, 2), outcome: entry.outcome!, source: entry.source!,
    reasonCodes: entry.reasonCodes, rulesWouldAssist: entry.rulesWouldAssist,
    ...(entry.judgments ? { judgments: {
      welcomeNow: entry.judgments.welcomeNow, makingProgress: entry.judgments.makingProgress, stuck: entry.judgments.stuck,
    } } : {}),
    ...(entry.confidence ? { confidence: entry.confidence } : {}),
    ...(typeof entry.elapsedMs === 'number' && Number.isFinite(entry.elapsedMs) ? { elapsedMs: entry.elapsedMs } : {}),
    ...(typeof entry.traceId === 'string' && /^[a-f0-9]{32}$/.test(entry.traceId) ? { traceId: entry.traceId } : {}),
  };
  const index = entries.findIndex(item => item.sessionId === safe.sessionId && item.point.sequence === safe.point.sequence
    && item.point.pageInstanceId === safe.point.pageInstanceId);
  if (index >= 0) entries[index] = safe; else entries.push(safe);
  while (entries.length > 50) entries.shift();
}

function namesFor(snapshot: ActivationSnapshot): string[] {
  const signals = snapshot.journey.raw.signals;
  const current = signals.filter(signal => signal.pageInstanceId === snapshot.journey.page.pageInstanceId);
  const compared = current.findLast(signal => signal.kind === 'entity.compared');
  const ids = compared?.entityIds ?? current.filter(signal => signal.kind === 'entity.viewed').flatMap(signal => signal.entityIds);
  return [...new Set(ids.map(id => getDestination(id)?.name ?? getPackage(id)?.packageName).filter((name): name is string => !!name))].slice(0, 2);
}

export function createTimingController(provider: ActivationProvider, fetchImpl: typeof fetch = fetch) {
  const stateFor = (id: string) => {
    let state = sessions.get(id);
    if (!state) { state = { failures: 0, fallback: false, running: false, seen: new Set() }; sessions.set(id, state); }
    return state;
  };
  const decideNow = async (point: DecisionPoint, shown: number): Promise<TimingEntry | undefined> => {
    const snapshot = provider.read(false);
    if (!snapshot || snapshot.journey.page.pageInstanceId !== point.pageInstanceId) return;
    const sessionId = snapshot.journey.sessionId;
    const state = stateFor(sessionId);
    const startedAt = Date.now();
    const first = snapshot.journey.raw.signals[0]?.ts;
    const visitStart = first && Number.isFinite(Date.parse(first)) ? Date.parse(first) : startedAt;
    const base: TimingEntry = {
      at: startedAt, startedAt: visitStart, sessionId, point, pageType: snapshot.journey.page.pageType,
      entityNames: namesFor(snapshot), outcome: 'blocked', source: 'safeguard',
      reasonCodes: [...snapshot.reasonCodes], rulesWouldAssist: snapshot.allowed,
    };
    if (!snapshot.allowed) { record(base); return base; }
    if (state.fallback) {
      const entry: TimingEntry = { ...base, outcome: 'assist', source: 'rules.fallback', reasonCodes: [] };
      record(entry); return entry;
    }
    const requestId = crypto.randomUUID();
    const request = {
      schemaVersion: 'aaa-moment-request-1',
      request: { schemaVersion: '1.0.0', requestId, requestedAt: new Date().toISOString(), journey: snapshot.journey, momentRuleId: snapshot.momentRuleId },
      decisionPoint: { kind: point.kind, sequence: point.sequence, pageSequence: point.pageSequence },
      exposure: { shownThisSession: shown },
    };
    record({ ...base, source: 'agent', outcome: 'pending', reasonCodes: [] });
    let entry: TimingEntry;
    try {
      const response = await fetchImpl('/api/aaa/moment', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(6000),
      });
      if (response.status === 429) {
        entry = { ...base, source: 'agent.failed', outcome: 'silent', reasonCodes: ['timing.rate_limited'] };
      } else {
        if (response.status === 503) {
          const error: unknown = await response.json();
          if (error && typeof error === 'object' && 'reasonCodes' in error && Array.isArray(error.reasonCodes)
            && error.reasonCodes.includes('timing.unavailable')) state.fallback = true;
        }
        if (!response.ok) throw new Error('timing.request_failed');
        const result = validateContract('MomentResult', await response.json());
        if (!result.valid) throw new Error('timing.invalid_result');
        const value = result.value;
        if (value.requestId !== requestId || value.sessionId !== sessionId || value.page.pageInstanceId !== point.pageInstanceId
          || value.page.pageType !== snapshot.journey.page.pageType || value.page.pageRevision !== snapshot.journey.page.pageRevision
          || value.decisionPoint.kind !== point.kind || value.decisionPoint.sequence !== point.sequence
          || value.decisionPoint.pageSequence !== point.pageSequence) {
          throw new Error('timing.invalid_result');
        }
        if (Date.parse(value.expiresAt) <= Date.now()) {
          removePending(sessionId, point);
          return;
        }
        if (value.source === 'agent.failed') {
          state.failures++;
          if (state.failures >= 2) state.fallback = true;
        } else state.failures = 0;
        entry = {
          ...base, source: value.source, outcome: value.source === 'safeguard' ? 'blocked' : value.source === 'agent.failed' ? 'silent' : value.decision,
          reasonCodes: [...value.reasonCodes], traceId: value.traceId,
          ...(value.judgments ? { judgments: value.judgments } : {}),
          ...(value.confidence ? { confidence: value.confidence } : {}),
        };
      }
    } catch (cause) {
      state.failures++;
      if (state.failures >= 2) state.fallback = true;
      console.warn('[aaa-timing] decision.failed', cause instanceof Error ? cause.name : 'unknown');
      entry = { ...base, source: 'agent.failed', outcome: 'silent', reasonCodes: ['timing.model_failed'] };
    }
    const fresh = provider.read(false);
    if (!fresh || fresh.journey.sessionId !== sessionId || fresh.journey.page.pageInstanceId !== point.pageInstanceId
      || fresh.journey.profileId !== snapshot.journey.profileId || fresh.journey.profileVersion !== snapshot.journey.profileVersion) {
      removePending(sessionId, point);
      return;
    }
    if (!fresh.allowed) entry = { ...base, source: 'safeguard', outcome: 'blocked', reasonCodes: [...fresh.reasonCodes] };
    entry.elapsedMs = Date.now() - startedAt;
    record(entry);
    return entry;
  };
  const decide = (point: DecisionPoint, shown: number, claimed = false): Promise<TimingEntry | undefined> => {
    const snapshot = provider.read(false);
    if (!snapshot || snapshot.journey.page.pageInstanceId !== point.pageInstanceId) return Promise.resolve(undefined);
    const state = stateFor(snapshot.journey.sessionId);
    const key = `${point.pageInstanceId}:${point.sequence}`;
    if (!claimed) {
      if (state.seen.has(key)) return Promise.resolve(undefined);
      state.seen.add(key);
    }
    if (state.running) return new Promise(resolve => {
      state.queued?.resolve(undefined);
      state.queued = { start: () => decide(point, shown, true), resolve };
    });
    state.running = true;
    const run = async () => {
      let result: TimingEntry | undefined;
      try { result = await decideNow(point, shown); return result; }
      finally {
        state.running = false;
        const queued = state.queued;
        state.queued = undefined;
        if (queued) {
          if (result?.outcome === 'assist') queued.resolve(undefined);
          else void queued.start().then(queued.resolve);
        }
      }
    };
    return run();
  };
  return { decide, timeline: timingTimeline, mode: (sessionId: string) => stateFor(sessionId).fallback ? 'rules.fallback' as const : 'agent' as const };
}
