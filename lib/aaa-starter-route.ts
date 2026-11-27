import { NextResponse } from 'next/server';
import { validateContract } from '@/aaa/contracts/validate';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '@/aaa/profile/loader';
import reviewedProfile from '@/sites/wanderly/profile.json';
import { generateContextualStarters, generateStarters } from '@/lib/aaa-starters';
import { createRateLimiter, readJsonBody } from '@/lib/request-guard';

const allow = createRateLimiter(30, 60_000);
const registry = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY });
registry.publish(reviewedProfile);

export async function handleStarterRequest(request: Request, contextual: boolean) {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!allow(client)) return NextResponse.json({ reasonCodes: ['service.rate_limited'] }, { status: 429 });
  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return NextResponse.json({ reasonCodes: ['request.invalid'] }, { status: body.status });
  const validated = validateContract('StarterRequest', body.value);
  if (!validated.valid) return NextResponse.json({ reasonCodes: ['request.invalid'] }, { status: 400 });
  const state = registry.state();
  if (!state.enabled || state.active.profile.profileId !== validated.value.journey.profileId || state.active.profile.profileVersion !== validated.value.journey.profileVersion) {
    return NextResponse.json({ reasonCodes: ['profile.unavailable'] }, { status: 503 });
  }
  const generate = contextual ? generateContextualStarters : generateStarters;
  const response = await generate(validated.value, state.active.profile, {
    endpoint: process.env.AAA_STARTER_SERVICE_URL,
    origin: process.env.AAA_STARTER_ORIGIN ?? 'http://localhost:3000',
  });
  return NextResponse.json(response, {
    headers: { 'cache-control': 'no-store', ...(response.traceId ? { 'X-AAA-Trace-Id': response.traceId } : {}) },
  });
}
