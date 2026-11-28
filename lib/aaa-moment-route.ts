import { validateContract } from '../aaa/contracts/validate.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '../aaa/profile/loader.ts';
import reviewedProfile from '../sites/wanderly/profile.json' with { type: 'json' };
import { createRateLimiter, readJsonBody } from './request-guard.ts';

const allow = createRateLimiter(60, 60_000);
const inFlight = new Set<string>();
const registry = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY });
registry.publish(reviewedProfile);
const headers = { 'cache-control': 'no-store' };
const error = (status: number, code: string) => Response.json({ reasonCodes: [code] }, { status, headers });

export async function handleMomentRequest(request: Request) {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!allow(client)) return error(429, 'timing.rate_limited');
  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return error(body.status, 'request.invalid');
  const envelope = validateContract('MomentRequest', body.value);
  if (!envelope.valid) return error(400, 'request.invalid');
  const inner = validateContract('StarterRequest', envelope.value.request);
  if (!inner.valid) return error(400, 'request.invalid');
  const state = registry.state();
  if (!state.enabled || state.active.profile.profileId !== inner.value.journey.profileId
    || state.active.profile.profileVersion !== inner.value.journey.profileVersion) return error(503, 'profile.unavailable');
  const endpoint = process.env.AAA_STARTER_SERVICE_URL;
  if (!endpoint) return error(503, 'timing.unavailable');
  const sessionId = inner.value.journey.sessionId;
  if (inFlight.has(sessionId)) return error(429, 'timing.in_flight');
  inFlight.add(sessionId);
  const configuredTimeout = Number(process.env.AAA_TIMING_TIMEOUT_MS);
  const timeout = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 6000;
  try {
    const response = await fetch(new URL('./moment', endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: process.env.AAA_STARTER_ORIGIN ?? 'http://localhost:3000' },
      body: JSON.stringify(envelope.value),
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 429) return error(429, 'timing.rate_limited');
    if (response.status === 503) {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'reasonCodes' in body && Array.isArray(body.reasonCodes)
        && body.reasonCodes.includes('timing.unavailable')) return error(503, 'timing.unavailable');
      return error(503, 'timing.service_failed');
    }
    if (!response.ok) return error(502, 'timing.service_failed');
    const result = validateContract('MomentResult', await response.json());
    if (!result.valid) return error(502, 'timing.invalid_result');
    const traceId = response.headers.get('X-AAA-Trace-Id');
    return Response.json(result.value, { headers: {
      ...headers, ...(traceId && /^[a-f0-9]{32}$/.test(traceId) ? { 'X-AAA-Trace-Id': traceId } : {}),
    } });
  } catch (cause) {
    console.warn('[aaa-timing] proxy.failed', cause instanceof Error ? cause.name : 'unknown');
    return error(502, 'timing.service_failed');
  } finally {
    inFlight.delete(sessionId);
  }
}
