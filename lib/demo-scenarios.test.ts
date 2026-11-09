import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy } from './assistance-policy.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { demoScenarios, pageForEvent } from './demo-scenarios.ts';

const policyFor = (events: Parameters<typeof journeyEvents>[0]) => {
  const context = buildJourneyContext(journeyEvents(events));
  return evaluatePolicy(decideAssistance(context), context, []);
};

test('every scenario produces an invitation before its follow-up', () => {
  for (const scenario of demoScenarios) assert.equal(policyFor(scenario.events).allowed, true, scenario.id);
});

test('the restraint scenario is silenced by its follow-up', () => {
  const scenario = demoScenarios.find(s => s.id === 'right-restraint')!;
  assert.ok(scenario.followUp);
  const result = policyFor([...scenario.events, ...scenario.followUp.events]);
  assert.equal(result.allowed, false);
  assert.equal(result.rule, 'NOT_ASSIST');
});

test('scenario events map to real site pages', () => {
  assert.equal(pageForEvent('DESTINATION_VIEW', 'bali'), '/destinations/bali');
  assert.equal(pageForEvent('COMPARE_VIEW'), '/compare');
  assert.equal(pageForEvent('BOOKING_START'), '/booking');
});
