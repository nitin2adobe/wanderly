import assert from 'node:assert/strict';
import test from 'node:test';
import { assistanceCopy } from './assistance-copy.ts';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy, hasPendingInvitation } from './assistance-policy.ts';
import { buildHandoff, validateHandoff } from './concierge-handoff.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { openConcierge, replyToPriority } from './mock-concierge.ts';

type Item = [WanderlyEventType, string?];
const NOW = new Date('2026-01-01T01:00:00Z');
const at = (n: number) => new Date(NOW.getTime() + n * 1000).toISOString();

function run(items: Item[], extra: WanderlyEvent[] = []) {
  const events = [...journeyEvents(items), ...extra];
  const context = buildJourneyContext(events);
  const decision = decideAssistance(context);
  return { context, decision, policy: evaluatePolicy(decision, context, events, NOW) };
}

test('journey A (right moment): comparison → invitation → handoff → concierge reply', () => {
  const { context, decision, policy } = run([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]);
  assert.equal(policy.allowed, true);
  const handoff = buildHandoff(context, decision, 'sess', NOW);
  assert.equal(validateHandoff(handoff).valid, true);
  assert.equal(assistanceCopy(handoff.intent, handoff.entities).headline, 'Need help comparing Bali and Maldives?');
  assert.match(openConcierge(handoff).message, /Bali and Maldives/);
  const reply = replyToPriority({ ...handoff, explicitPreferences: { priority: 'BUDGET' } }, 'BUDGET');
  assert.deepEqual(reply.facts.map(f => f.entity), ['Bali', 'Maldives']);
});

test('journey B (right restraint): comparison followed by booking never invites', () => {
  const { decision, policy } = run([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'],
    ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START'],
  ]);
  assert.equal(decision.decision, 'SILENT');
  assert.equal(policy.allowed, false);
});

test('journey C (respectful adaptation): a dismissed invitation is not repeated', () => {
  const session: WanderlyEvent[] = [
    { id: 's', sessionId: 'x', timestamp: at(-600), eventType: 'ASSISTANCE_SHOWN', page: '/', metadata: { assistanceType: 'DESTINATION_COMPARISON' } },
    { id: 'd', sessionId: 'x', timestamp: at(-590), eventType: 'ASSISTANCE_DISMISSED', page: '/', metadata: { assistanceType: 'DESTINATION_COMPARISON', reason: 'visitor' } },
  ];
  assert.equal(hasPendingInvitation(session), false);
  const { policy } = run([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ], session);
  assert.equal(policy.allowed, false);
  assert.equal(policy.rule, 'TYPE_ALREADY_HANDLED');
});

test('the same engine drives a different entity pair end to end', () => {
  const { context, decision, policy } = run([
    ['DESTINATION_VIEW', 'japan'], ['DESTINATION_VIEW', 'switzerland'], ['DESTINATION_VIEW', 'japan'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'switzerland'],
  ]);
  assert.equal(policy.allowed, true);
  const handoff = buildHandoff(context, decision, 'sess', NOW);
  assert.match(openConcierge(handoff).message, /Japan and Switzerland/);
  assert.doesNotMatch(JSON.stringify(replyToPriority(handoff, 'ACTIVITIES')), /Bali|Maldives/);
});
