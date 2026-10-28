import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAssistanceDecision } from './assistance-schema.ts';
import { HttpLLMProvider, OpenAIProvider, systemInstruction, type LLMRequest } from './llm-provider.ts';
import { createRateLimiter, readJsonBody } from './request-guard.ts';
import type { JourneyContext } from './journey-context.ts';

const context: JourneyContext = {
  destinationsViewed: [], packagesViewed: [], destinationSwitches: 0, packageSwitches: 0, destinationSwitching: 'NONE',
  comparisonActivity: 'NONE', pricingExploration: 'NONE', informationSeeking: 'NONE', bookingProgression: 'NONE',
  journeyProgression: 'NEUTRAL', potentialFriction: 'NONE', recentJourney: [], semanticEventCount: 0,
};
const request: LLMRequest = { systemInstruction, context };
const decision = { decision: 'SILENT', confidence: 0.9, assistanceType: 'NONE', headline: 'h', reason: 'r', evidence: ['e'] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('system instruction describes the output schema', () => {
  for (const term of ['"decision"', '"confidence"', '"assistanceType"', '"headline"', '"reason"', '"evidence"', '"ASSIST"', '"TRAVEL_INFORMATION"']) {
    assert.ok(systemInstruction.includes(term), `missing ${term}`);
  }
});

test('decision validation rejects inconsistent assistance types', () => {
  assert.equal(validateAssistanceDecision({ ...decision, decision: 'ASSIST' }).valid, false);
  assert.equal(validateAssistanceDecision({ ...decision, assistanceType: 'PACKAGE_SELECTION' }).valid, false);
  assert.equal(validateAssistanceDecision({ ...decision, decision: 'ASSIST', assistanceType: 'PACKAGE_SELECTION' }).valid, true);
});

test('OpenAI provider parses fenced JSON and records usage', async () => {
  let sent: { signal?: unknown; body?: string } = {};
  const provider = new OpenAIProvider('m', 'key', undefined, (async (_url: unknown, init: RequestInit) => {
    sent = { signal: init.signal, body: init.body as string };
    return json({ choices: [{ message: { content: '```json\n' + JSON.stringify(decision) + '\n```' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
  }) as typeof fetch);
  assert.deepEqual(await provider.generateStructured(request), decision);
  assert.equal(provider.lastUsage?.totalTokens, 3);
  assert.ok(sent.signal, 'request must carry a timeout signal');
});

test('OpenAI provider clears stale usage and rejects HTTP errors, empty content, and invalid JSON', async () => {
  const responses = [
    json({ choices: [{ message: { content: JSON.stringify(decision) } }], usage: { total_tokens: 5 } }),
    json({}, 500),
    json({ choices: [] }),
    json({ choices: [{ message: { content: 'not json' } }] }),
  ];
  const provider = new OpenAIProvider('m', 'key', undefined, (async () => responses.shift()!) as typeof fetch);
  await provider.generateStructured(request);
  assert.equal(provider.lastUsage?.totalTokens, 5);
  await assert.rejects(provider.generateStructured(request), /HTTP 500/);
  assert.equal(provider.lastUsage, undefined);
  await assert.rejects(provider.generateStructured(request), /no message content/);
  await assert.rejects(provider.generateStructured(request), /invalid JSON/);
});

test('HTTP provider accepts bare or wrapped decisions and rejects failures', async () => {
  const responses = [json(decision), json({ decision }), json({}, 503), json('text')];
  const provider = new HttpLLMProvider('m', 'https://example.test', 'key', (async () => responses.shift()!) as typeof fetch);
  assert.deepEqual(await provider.generateStructured(request), decision);
  assert.deepEqual(await provider.generateStructured(request), decision);
  await assert.rejects(provider.generateStructured(request), /HTTP 503/);
  await assert.rejects(provider.generateStructured(request), /non-object/);
});

test('rate limiter blocks after the limit and recovers after the window', () => {
  let now = 0;
  const allow = createRateLimiter(2, 1000, () => now);
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  now = 1001;
  assert.equal(allow('a'), true);
});

test('body reader enforces size and JSON validity', async () => {
  const post = (body: string) => new Request('http://localhost/x', { method: 'POST', body });
  assert.deepEqual(await readJsonBody(post('{"a":1}')), { ok: true, value: { a: 1 } });
  assert.deepEqual(await readJsonBody(post('{bad')), { ok: false, status: 400, error: 'Request body must be valid JSON.' });
  const tooLarge = await readJsonBody(post('{"a":"' + 'x'.repeat(50) + '"}'), 20);
  assert.equal(tooLarge.ok === false && tooLarge.status, 413);
});
