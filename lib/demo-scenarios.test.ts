import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy } from './assistance-policy.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { demoScenarios, pageForEvent } from './demo-scenarios.ts';
import { adaptEvents, electronicsAdapter } from './brand-adapters.ts';

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

test('electronics versions of the scenarios behave like the Wanderly ones', () => {
  for (const scenario of demoScenarios) {
    const before = adaptEvents(electronicsAdapter, scenario.electronics.events, 's');
    const context = buildJourneyContext(before);
    assert.equal(evaluatePolicy(decideAssistance(context), context, []).allowed, true, scenario.id);
    if (scenario.electronics.followUp) {
      const after = buildJourneyContext(adaptEvents(electronicsAdapter, [...scenario.electronics.events, ...scenario.electronics.followUp.events], 's'));
      assert.equal(decideAssistance(after).decision, 'SILENT', scenario.id);
    }
  }
});

test('scenario events map to real site pages', () => {
  for (const scenario of demoScenarios) assert.doesNotMatch(scenario.electronics.expectation, /Bali|Maldives|booking|destination/i);
  assert.equal(pageForEvent('DESTINATION_VIEW', 'bali'), '/destinations/bali');
  assert.equal(pageForEvent('COMPARE_VIEW'), '/compare');
  assert.equal(pageForEvent('BOOKING_START'), '/booking');
});
