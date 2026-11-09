import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy, hasPendingInvitation, isForwardProgress } from './assistance-policy.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';

type Item = [WanderlyEventType, string?];
const NOW = new Date('2026-01-01T00:10:00Z');
const evaluate = (items: Item[], session: WanderlyEvent[] = [], now = NOW) => {
  const context = buildJourneyContext(journeyEvents(items));
  return evaluatePolicy(decideAssistance(context), context, session, now);
};
const assistanceEvent = (eventType: WanderlyEventType, assistanceType: string, at: string): WanderlyEvent =>
  ({ id: `${eventType}-${at}`, sessionId: 's', timestamp: at, eventType, page: '/', metadata: { assistanceType } });

const journey1: Item[] = [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'maldives'], ['BOOKING_START']];
const journey2: Item[] = [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives']];
const journey3: Item[] = [['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW'], ['DESTINATION_VIEW', 'japan'], ['FAQ_SEARCH']];
const journey6: Item[] = [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']];

test('STEP3 acceptance journeys: 2 and 3 are allowed, 1 and 6 are blocked', () => {
  assert.equal(evaluate(journey2).allowed, true);
  assert.equal(evaluate(journey3).allowed, true);
  assert.equal(evaluate(journey1).allowed, false);
  assert.equal(evaluate(journey6).allowed, false);
});

test('non-ASSIST decisions are blocked', () => {
  assert.equal(evaluate([['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'maldives']]).rule, 'NOT_ASSIST');
});

test('low-confidence proposals are blocked', () => {
  const context = buildJourneyContext(journeyEvents(journey2));
  const result = evaluatePolicy({ decision: 'ASSIST', confidence: 0.79, assistanceType: 'DESTINATION_COMPARISON' }, context, [], NOW);
  assert.equal(result.rule, 'LOW_CONFIDENCE');
});

test('forward progress blocks even a model ASSIST proposal', () => {
  const context = buildJourneyContext(journeyEvents(journey6));
  const result = evaluatePolicy({ decision: 'ASSIST', confidence: 0.95, assistanceType: 'DESTINATION_COMPARISON' }, context, [], NOW);
  assert.equal(result.rule, 'FORWARD_PROGRESS');
});

test('a visible invitation blocks another', () => {
  const session = [assistanceEvent('ASSISTANCE_SHOWN', 'DESTINATION_COMPARISON', '2026-01-01T00:09:00Z')];
  assert.equal(hasPendingInvitation(session), true);
  assert.equal(evaluate(journey2, session).rule, 'INVITATION_PENDING');
});

test('a dismissed or accepted type is not offered again', () => {
  for (const response of ['ASSISTANCE_DISMISSED', 'ASSISTANCE_ACCEPTED'] as const) {
    const session = [
      assistanceEvent('ASSISTANCE_SHOWN', 'DESTINATION_COMPARISON', '2026-01-01T00:00:00Z'),
      assistanceEvent(response, 'DESTINATION_COMPARISON', '2026-01-01T00:00:30Z'),
    ];
    assert.equal(hasPendingInvitation(session), false);
    assert.equal(evaluate(journey2, session).rule, 'TYPE_ALREADY_HANDLED');
  }
});

test('cooldown applies after a dismissal and expires', () => {
  const session = [
    assistanceEvent('ASSISTANCE_SHOWN', 'PACKAGE_SELECTION', '2026-01-01T00:08:00Z'),
    assistanceEvent('ASSISTANCE_DISMISSED', 'PACKAGE_SELECTION', '2026-01-01T00:09:00Z'),
  ];
  assert.equal(evaluate(journey2, session).rule, 'COOLDOWN');
  assert.equal(evaluate(journey2, session, new Date('2026-01-01T00:12:00Z')).allowed, true);
});

test('each visitor dismissal doubles the cooldown', () => {
  const session = [
    assistanceEvent('ASSISTANCE_SHOWN', 'PACKAGE_SELECTION', '2026-01-01T00:00:00Z'),
    assistanceEvent('ASSISTANCE_DISMISSED', 'PACKAGE_SELECTION', '2026-01-01T00:01:00Z'),
  ];
  // One dismissal: 120s cooldown has passed 150s later.
  assert.equal(evaluate(journey2, session, new Date('2026-01-01T00:03:30Z')).allowed, true);
  const afterSecond = [
    ...session,
    assistanceEvent('ASSISTANCE_SHOWN', 'TRAVEL_INFORMATION', '2026-01-01T00:04:00Z'),
    { ...assistanceEvent('ASSISTANCE_DISMISSED', 'TRAVEL_INFORMATION', '2026-01-01T00:05:00Z'), metadata: { assistanceType: 'TRAVEL_INFORMATION', reason: 'visitor' } },
  ];
  assert.equal(evaluate(journey2, afterSecond, new Date('2026-01-01T00:05:00Z')).rule, 'REPEATED_DISMISSALS');
});

test('plugin withdrawals do not trigger the repeated-dismissal stop', () => {
  const withdrawn = (at: string, type: string): WanderlyEvent => ({ ...assistanceEvent('ASSISTANCE_DISMISSED', type, at), metadata: { assistanceType: type, reason: 'withdrawn' } });
  const session = [
    assistanceEvent('ASSISTANCE_SHOWN', 'PACKAGE_SELECTION', '2026-01-01T00:00:00Z'), withdrawn('2026-01-01T00:00:10Z', 'PACKAGE_SELECTION'),
    assistanceEvent('ASSISTANCE_SHOWN', 'TRAVEL_INFORMATION', '2026-01-01T00:01:00Z'), withdrawn('2026-01-01T00:01:10Z', 'TRAVEL_INFORMATION'),
  ];
  assert.notEqual(evaluate(journey2, session, new Date('2026-01-01T01:00:00Z')).rule, 'REPEATED_DISMISSALS');
});

test('forward progress is detected independently of who proposed the invitation', () => {
  const progressing = buildJourneyContext(journeyEvents(journey6));
  const browsing = buildJourneyContext(journeyEvents(journey2));
  assert.equal(isForwardProgress(progressing), true);
  assert.equal(isForwardProgress(browsing), false);
});

test('the per-session invitation budget is enforced', () => {
  const session = [
    assistanceEvent('ASSISTANCE_SHOWN', 'PACKAGE_SELECTION', '2026-01-01T00:00:00Z'),
    assistanceEvent('ASSISTANCE_ACCEPTED', 'PACKAGE_SELECTION', '2026-01-01T00:00:10Z'),
    assistanceEvent('ASSISTANCE_SHOWN', 'TRAVEL_INFORMATION', '2026-01-01T00:01:00Z'),
    assistanceEvent('ASSISTANCE_ACCEPTED', 'TRAVEL_INFORMATION', '2026-01-01T00:01:10Z'),
  ];
  assert.equal(evaluate(journey2, session).rule, 'SESSION_BUDGET');
});
