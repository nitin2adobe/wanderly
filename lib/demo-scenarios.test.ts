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

test('comparison scenarios allow automatic assistance except when booking is already progressing', () => {
  for (const scenario of demoScenarios) assert.equal(policyFor(scenario.events).allowed, scenario.id !== 'right-restraint', scenario.id);
});

test('the restraint scenario is silent before any chat or greeting can be triggered', () => {
  const scenario = demoScenarios.find(s => s.id === 'right-restraint')!;
  const result = policyFor(scenario.events);
  assert.equal(result.allowed, false);
  assert.equal(result.rule, 'NOT_ASSIST');
});

test('electronics retains invitation and withdrawal behavior without a live chat', () => {
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
