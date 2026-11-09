import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeAssistance } from './activation-proposal.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';

const context = buildJourneyContext(journeyEvents([
  ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
]));
const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const aiDecision = { decision: 'ASSIST', confidence: 0.86, assistanceType: 'DESTINATION_COMPARISON', headline: 'h', reason: 'r', evidence: ['e'] };

test('rules mode never calls the reasoner', async () => {
  const fail = (async () => { throw new Error('should not be called'); }) as unknown as typeof fetch;
  const proposal = await proposeAssistance(context, false, fail);
  assert.equal(proposal.source, 'rules');
  assert.equal(proposal.decision.decision, 'ASSIST');
});

test('AI mode returns the validated reasoner decision and labels its source', async () => {
  assert.deepEqual(await proposeAssistance(context, true, json({ mode: 'mock', decision: aiDecision })), { decision: aiDecision, source: 'ai-mock' });
  assert.equal((await proposeAssistance(context, true, json({ mode: 'live', decision: aiDecision }))).source, 'ai-live');
});

test('AI failures fall back to the rules', async () => {
  const throwing = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  for (const impl of [throwing, json({ error: 'x' }, 502), json({ mode: 'live', decision: { decision: 'ASSIST' } })]) {
    const proposal = await proposeAssistance(context, true, impl);
    assert.equal(proposal.source, 'rules-fallback');
    assert.equal(proposal.decision.decision, 'ASSIST');
  }
});
