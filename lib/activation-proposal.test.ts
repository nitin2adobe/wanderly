import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeAssistance, recordedActivationProposal } from './activation-proposal.ts';
import type { WanderlyEvent } from './events.ts';
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

test('the activation trace uses the active AI WAIT instead of the rules ASSIST', () => {
  const wait = { ...aiDecision, decision: 'WAIT', assistanceType: 'NONE' };
  const evaluation: WanderlyEvent = {
    id: 'evaluation', sessionId: 'test', timestamp: new Date().toISOString(),
    eventType: 'ASSISTANCE_EVALUATED', page: '/destinations/maldives',
    metadata: { activationMode: 'ai', source: 'ai-live', contextKey: JSON.stringify(context), decision: wait },
  };
  assert.deepEqual(recordedActivationProposal([evaluation], context, true), { decision: wait, source: 'ai-live' });
  assert.equal(recordedActivationProposal([evaluation], context, false), undefined);
  const changed = buildJourneyContext(journeyEvents([['DESTINATION_VIEW', 'japan']]));
  assert.equal(recordedActivationProposal([evaluation], changed, true), undefined);
  assert.deepEqual(buildJourneyContext([...journeyEvents([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]), evaluation]), context);
});

test('invalid recorded proposals are not presented as active decisions', () => {
  const evaluation: WanderlyEvent = {
    id: 'evaluation', sessionId: 'test', timestamp: new Date().toISOString(),
    eventType: 'ASSISTANCE_EVALUATED', page: '/',
    metadata: { activationMode: 'ai', source: 'ai-live', contextKey: JSON.stringify(context), decision: { decision: 'ASSIST' } },
  };
  assert.equal(recordedActivationProposal([evaluation], context, true), undefined);
});
