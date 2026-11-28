import type { JourneyState, SiteProfile, StarterRequest, StarterResult } from '../aaa/contracts/types.ts';
import { validateContract } from '../aaa/contracts/validate.ts';
import { staleStarterReason, starterTrace, starterServiceTimeoutMs, templateStarters, type StarterResponse, type StarterTrace } from './aaa-starters.ts';
import { validateContextualStarters } from './aaa-contextual-starters.ts';

export type ActivationSnapshot = {
  journey: JourneyState;
  profile: Readonly<SiteProfile>;
  momentRuleId: string;
  allowed: boolean;
  reasonCodes: readonly string[];
};
export type ActivationProvider = {
  refresh?(): Promise<void>;
  read(currentNudge: boolean, visitorActivation?: boolean): ActivationSnapshot | undefined;
  recordShown(): { allowed: boolean; reasonCodes: readonly string[] };
  recordDismissed(): void;
};
export type PreparedNudge = { request: StarterRequest; response: StarterResponse };
export type ActivationTraceEntry = { at: number; sessionId: string; phase: string; trace: StarterTrace; traceId?: string };
export const AAA_TRACE_CHANGED = 'aaa:activation-trace';
const traces: ActivationTraceEntry[] = [];

function addTrace(entry: ActivationTraceEntry) {
  traces.push(entry);
  if (traces.length > 50) traces.shift();
}

export function acceptFrameActivationTrace(value: unknown) {
  if (!value || typeof value !== 'object' || !('sessionId' in value) || typeof value.sessionId !== 'string'
    || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.sessionId)
    || !('phase' in value) || typeof value.phase !== 'string' || !/^[a-z.]{1,40}$/.test(value.phase)
    || !('at' in value) || typeof value.at !== 'number' || !Number.isFinite(value.at) || Math.abs(value.at) > 8640000000000000
    || !('trace' in value)) return;
  const traceId = 'traceId' in value && typeof value.traceId === 'string' && /^[a-f0-9]{32}$/.test(value.traceId)
    ? value.traceId : undefined;
  addTrace({ sessionId: value.sessionId, phase: value.phase, at: value.at, trace: starterTrace(value.trace), ...(traceId ? { traceId } : {}) });
}

export function recordActivationTrace(sessionId: string, phase: string, trace: Partial<StarterTrace>, traceId?: string) {
  const entry = { at: Date.now(), sessionId, phase, trace: starterTrace(trace), ...(traceId && /^[a-f0-9]{32}$/.test(traceId) ? { traceId } : {}) };
  addTrace(entry);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AAA_TRACE_CHANGED));
    if (window.parent !== window) {
      try {
        if (window.parent.location.origin === window.location.origin && window.parent.location.pathname === '/demo/live') {
          window.parent.dispatchEvent(new CustomEvent(AAA_TRACE_CHANGED, { detail: entry }));
        }
      } catch (error) {
        console.warn('[aaa-activation] trace.parent_unavailable', error instanceof Error ? error.name : 'unknown');
      }
    }
  }
}
export const getActivationTraces = (sessionId: string) => traces.filter(trace => trace.sessionId === sessionId);

const inFlight = new Set<string>();

export function nudgeInvalidReason(nudge: PreparedNudge, snapshot: ActivationSnapshot | undefined, now = Date.now()): string | undefined {
  if (!snapshot) return 'activation.unavailable';
  const reason = staleStarterReason(nudge.response.result, { ...nudge.request, journey: snapshot.journey }, now);
  if (reason) return reason;
  if (!snapshot.allowed) return snapshot.reasonCodes[0] ?? 'activation.ineligible';
  if (snapshot.momentRuleId !== nudge.request.momentRuleId) return 'activation.moment_changed';
}

export function createActivationController(provider: ActivationProvider, fetchImpl: typeof fetch = fetch) {
  let generation: AbortController | undefined;
  const isFresh = (nudge: PreparedNudge, currentNudge = true, visitorActivation = false): boolean => {
    const reason = nudgeInvalidReason(nudge, provider.read(currentNudge, visitorActivation));
    if (reason) recordActivationTrace(nudge.request.journey.sessionId, 'suppressed', { suppressionReasons: [reason] });
    return !reason;
  };
  return {
    async prepare(): Promise<PreparedNudge | undefined> {
      const snapshot = provider.read(false);
      if (!snapshot?.allowed) return;
      const sessionId = snapshot.journey.sessionId;
      if (inFlight.has(sessionId)) return;
      inFlight.add(sessionId);
      const controller = new AbortController();
      generation = controller;
      const request: StarterRequest = {
        schemaVersion: '1.0.0', requestId: crypto.randomUUID(), requestedAt: new Date().toISOString(),
        journey: snapshot.journey, momentRuleId: snapshot.momentRuleId,
      };
      try {
        let response: StarterResponse;
        try {
          const fetchResult = async (path: string, timeout: number): Promise<StarterResponse> => {
            const res = await fetchImpl(path, {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
            });
            if (!res.ok) throw new Error('service.unavailable');
            const body: unknown = await res.json();
            if (!body || typeof body !== 'object' || !('result' in body)) throw new Error('service.invalid_result');
            const result = validateContract('StarterResult', body.result);
            if (!result.valid) throw new Error('service.invalid_result');
            const contextual = 'schemaVersion' in body && body.schemaVersion === 'aaa-contextual-starters-1'
              ? validateContextualStarters({
                schemaVersion: body.schemaVersion, result: body.result,
                ...('starterProvenance' in body ? { starterProvenance: body.starterProvenance } : {}),
                ...('headline' in body ? { headline: body.headline } : {}),
                ...('intentSummary' in body ? { intentSummary: body.intentSummary } : {}),
              }) : undefined;
            if (('schemaVersion' in body && !contextual)
              || (!contextual && ('headline' in body || 'intentSummary' in body || 'starterProvenance' in body))) {
              throw new Error('service.invalid_result');
            }
            const traceId = res.headers.get('X-AAA-Trace-Id') ?? ('traceId' in body ? body.traceId : undefined);
            return {
              result: result.value, trace: starterTrace('trace' in body ? body.trace : undefined),
              ...(contextual ? {
                schemaVersion: contextual.schemaVersion, starterProvenance: contextual.starterProvenance,
                ...(contextual.headline ? { headline: contextual.headline } : {}),
                ...(contextual.intentSummary ? { intentSummary: contextual.intentSummary } : {}),
              } : {}),
              ...(typeof traceId === 'string' && /^[a-f0-9]{32}$/.test(traceId) ? { traceId } : {}),
            };
          };
          try {
            response = await fetchResult('/api/aaa/contextual-starters', starterServiceTimeoutMs() * 2 + 3000);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            console.warn('[aaa-activation] contextual.fallback');
            response = await fetchResult('/api/aaa/starters', starterServiceTimeoutMs() + 2000);
          }
        } catch (error) {
          if (controller.signal.aborted) {
            recordActivationTrace(sessionId, 'generation', { suppressionReasons: ['activation.generation_cancelled'] });
            return;
          }
          const reason = error instanceof Error && error.message === 'service.invalid_result' ? error.message : 'service.unavailable';
          console.warn('[aaa-activation]', reason);
          response = templateStarters(request, snapshot.profile, reason);
        }
        recordActivationTrace(sessionId, 'generation', { ...response.trace, reasonCodes: [...response.trace.reasonCodes, ...response.result.reasonCodes] }, response.traceId);
        const nudge = { request, response };
        const reason = nudgeInvalidReason(nudge, provider.read(false));
        if (controller.signal.aborted || reason || response.result.outcome === 'abstain' || !response.result.starters.length) {
          recordActivationTrace(sessionId, 'suppressed', { suppressionReasons: [reason ?? 'activation.abstained'] });
          return;
        }
        return nudge;
      } finally {
        inFlight.delete(sessionId);
        if (generation === controller) generation = undefined;
      }
    },
    isFresh,
    async isFreshForSend(nudge: PreparedNudge): Promise<boolean> {
      try { await provider.refresh?.(); }
      catch (error) {
        console.error('[aaa-activation] settings.refresh_failed', error);
        return false;
      }
      return isFresh(nudge);
    },
    cancel() { generation?.abort(); },
  };
}
