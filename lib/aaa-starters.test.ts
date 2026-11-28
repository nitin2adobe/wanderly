import assert from 'node:assert/strict';
import test from 'node:test';
import { travelProfile, travelRequest, travelResult } from '../sites/wanderly/contract-examples.ts';
import { validateContract } from '../aaa/contracts/validate.ts';
import { generateContextualStarters, generateStarters, staleStarterReason, starterTrace, starterServiceTimeoutMs, templateStarters } from './aaa-starters.ts';
import { validateContextualStarters } from './aaa-contextual-starters.ts';

const now = Date.parse(travelResult.generatedAt);

test('contextual generation validates provenance and falls back to the legacy endpoint', async () => {
  const envelope = {
    schemaVersion: 'aaa-contextual-starters-1',
    result: travelResult,
    starterProvenance: travelResult.starters.map(starter => ({ starterId: starter.starterId, source: 'generated' })),
    headline: { text: 'Find your trip', source: 'generated' },
    intentSummary: 'Comparing trips',
  };
  assert.equal(validateContextualStarters({ ...envelope, starterProvenance: [] }), undefined);
  assert.equal(validateContextualStarters({ ...envelope, starterProvenance: [...envelope.starterProvenance].reverse() }), undefined);
  assert.equal(validateContextualStarters({ ...envelope, extra: true }), undefined);
  const invalidOptional = validateContextualStarters({ ...envelope, headline: { text: 'x'.repeat(121), source: 'generated' }, intentSummary: 'x'.repeat(201) });
  assert.ok(invalidOptional);
  assert.equal(invalidOptional.headline, undefined);
  assert.equal(invalidOptional.intentSummary, undefined);
  const urls: string[] = [];
  const run = (invalid: boolean) => generateContextualStarters(travelRequest, travelProfile, {
    endpoint: 'http://localhost/aaa/starters', now: () => now,
    fetchImpl: async url => {
      urls.push(String(url));
      return Response.json(String(url).endsWith('/contextual-starters') ? (invalid ? { ...envelope, starterProvenance: [] } : envelope) : travelResult);
    },
  });
  const generated = await run(false);
  assert.deepEqual(generated.result, travelResult);
  assert.equal(generated.intentSummary, 'Comparing trips');
  urls.length = 0;
  assert.deepEqual((await run(true)).result, travelResult);
  assert.deepEqual(urls, ['http://localhost/aaa/contextual-starters', 'http://localhost/aaa/starters']);
});

test('unreachable service returns only approved templates without padding', async () => {
  const response = await generateStarters(travelRequest, travelProfile, {
    endpoint: 'http://localhost/aaa/starters', now: () => now,
    fetchImpl: async () => { throw new TypeError('offline'); },
  });
  assert.equal(validateContract('StarterResult', response.result).valid, true);
  assert.equal(response.result.outcome, 'fallback');
  assert.equal(response.result.starters.length, 1);
  assert.equal(response.result.starters[0].text, travelProfile.playbooks[0].starters[0].text['en-US']);
  assert.deepEqual(response.trace.fallbackReasons, ['service.unavailable']);
});

test('HTTP failures report status without exposing response bodies and still use approved fallback', async () => {
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args); };
  try {
    const response = await generateContextualStarters(travelRequest, travelProfile, {
      endpoint: 'http://localhost/aaa/starters', now: () => now,
      fetchImpl: async url => new Response('private response body', { status: String(url).endsWith('/contextual-starters') ? 429 : 503 }),
    });
    assert.equal(response.result.outcome, 'fallback');
    assert.ok(warnings.some(args => args.includes('contextual.http_error.429')));
    assert.ok(warnings.some(args => args.includes('[aaa-starters] service.http_error') && args.includes(503)));
    assert.doesNotMatch(JSON.stringify(warnings), /private response body/);
  } finally {
    console.warn = warn;
  }
});

test('no eligible helpful primary abstains rather than fabricating a question', () => {
  const profile = structuredClone(travelProfile);
  profile.playbooks = profile.playbooks.filter(playbook => playbook.id !== 'compare-help') as typeof profile.playbooks;
  const response = templateStarters(travelRequest, profile, 'service.unavailable', now);
  assert.equal(response.result.outcome, 'abstain');
  assert.deepEqual(response.result.starters, []);
  assert.equal(validateContract('StarterResult', response.result).valid, true);
});

test('fallback never uses historical-page evidence to suggest unsupported current-page claims', () => {
  const request = structuredClone(travelRequest);
  request.journey.page = { ...request.journey.page, pageInstanceId: 'new-page' };
  const response = templateStarters(request, travelProfile, 'service.unavailable', now);
  assert.equal(response.result.outcome, 'abstain');
  assert.deepEqual(response.result.starters, []);
});

test('valid v1 responses pass through and malformed or mismatched results fall back', async () => {
  const call = (body: unknown) => generateStarters(travelRequest, travelProfile, {
    endpoint: 'http://localhost/aaa/starters', now: () => now,
    fetchImpl: async () => Response.json(body),
  });
  assert.deepEqual((await call(travelResult)).result, travelResult);
  assert.equal((await call({ ...travelResult, pageRevision: 100 })).result.reasonCodes[0], 'starter.page_changed');
  assert.equal((await call({ ...travelResult, playbookId: 'invented' })).result.reasonCodes[0], 'starter.unapproved_playbook');
  assert.equal((await call({ ...travelResult, evidenceIds: ['invented'] })).result.reasonCodes[0], 'starter.invalid_evidence');
  assert.equal((await call({ ...travelResult, starters: [...travelResult.starters, ...travelResult.starters] })).result.reasonCodes[0], 'service.invalid_result');
});

test('freshness binds request, session, profile, page identity, revision, locale and lifetime', () => {
  assert.equal(staleStarterReason(travelResult, travelRequest, now), undefined);
  for (const [field, value, reason] of [
    ['requestId', 'new', 'starter.request_changed'],
    ['sessionId', 'new', 'starter.session_changed'],
    ['profileVersion', '2.0.0', 'starter.profile_changed'],
    ['pageInstanceId', 'new', 'starter.page_changed'],
    ['pageRevision', 99, 'starter.page_changed'],
    ['locale', 'fr-FR', 'starter.locale_changed'],
  ] as const) {
    assert.equal(staleStarterReason({ ...travelResult, [field]: value }, travelRequest, now), reason);
  }
  assert.equal(staleStarterReason(travelResult, travelRequest, Date.parse(travelResult.expiresAt)), 'starter.expired');
});

test('trace accepts only bounded machine codes and never raw tool or page data', () => {
  assert.deepEqual(starterTrace({
    tools: ['profile.read', { input: 'private page' }, 'raw page content', '<script>'],
    reasonCodes: ['validator.passed'], alternatives: ['candidate.rejected'],
    validatorVerdicts: ['schema.valid'], fallbackReasons: ['service.unavailable'],
    suppressionReasons: ['transaction.active'], rawPage: 'private',
  }), {
    tools: ['profile.read'], reasonCodes: ['validator.passed'], alternatives: ['candidate.rejected'],
    validatorVerdicts: ['schema.valid'], fallbackReasons: ['service.unavailable'], suppressionReasons: ['transaction.active'],
  });

  test('demo deadline is configurable but bounded; invalid values retain the short default', () => {
    assert.equal(starterServiceTimeoutMs('18000'), 18000);
    assert.equal(starterServiceTimeoutMs(''), 4000);
    assert.equal(starterServiceTimeoutMs('Infinity'), 4000);
    assert.equal(starterServiceTimeoutMs('31000'), 4000);
  });

  test('reads separately versioned service trace using trusted origin, forwarding its ID without raw fields', async () => {
    const traceId = 'a'.repeat(32);
    const requests: { url: string; origin: string | null }[] = [];
    const response = await generateStarters(travelRequest, travelProfile, {
      endpoint: 'http://localhost/aaa/starters', origin: 'http://localhost:3000', now: () => now,
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), origin: new Headers(init?.headers).get('Origin') });
        if (init?.method === 'POST') return Response.json(travelResult, { headers: { 'X-AAA-Trace-Id': traceId } });
        return Response.json({ schemaVersion: 'aaa-trace-1', traceId, events: [
          { code: 'playbook.considered', playbookId: 'private-id' },
          { code: 'tool.catalog.found', arguments: 'private' },
          { code: 'validator.passed', rawPage: 'private' },
          { code: 'model.timeout' },
        ] });
      },
    });
    assert.equal(response.traceId, traceId);
    assert.deepEqual(response.trace.tools, ['tool.catalog.found']);
    assert.deepEqual(response.trace.alternatives, ['playbook.considered']);
    assert.deepEqual(response.trace.validatorVerdicts, ['validator.passed']);
    assert.deepEqual(response.trace.fallbackReasons, ['model.timeout']);
    assert.equal(JSON.stringify(response.trace).includes('private'), false);
    assert.equal(requests[1].url, `http://localhost/aaa/traces/${traceId}`);
    assert.ok(requests.every(request => request.origin === 'http://localhost:3000'));
  });

  test('unavailable diagnostics do not replace a valid service result with a fallback', async () => {
    const response = await generateStarters(travelRequest, travelProfile, {
      endpoint: 'http://localhost/aaa/starters', now: () => now,
      fetchImpl: async (_url, init) => init?.method === 'POST'
        ? Response.json(travelResult, { headers: { 'X-AAA-Trace-Id': 'a'.repeat(32) } })
        : new Response(null, { status: 404 }),
    });
    assert.deepEqual(response.result, travelResult);
    assert.deepEqual(response.trace.reasonCodes, ['trace.unavailable']);
  });
});
