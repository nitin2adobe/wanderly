import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy } from './assistance-policy.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { demoScenarios, pageForEvent } from './demo-scenarios.ts';
import { adaptEvents, electronicsAdapter } from './brand-adapters.ts';
import { contextualHandoff } from './concierge-context.ts';
import { buildHandoff } from './concierge-handoff.ts';
import { conciergeOpeningMessage } from './concierge-message.ts';

const policyFor = (events: Parameters<typeof journeyEvents>[0]) => {
  const context = buildJourneyContext(journeyEvents(events));
  return evaluatePolicy(decideAssistance(context), context, []);
};

test('assistance scenarios are allowed except when booking is already progressing', () => {
  for (const scenario of demoScenarios) assert.equal(policyFor(scenario.events).allowed, scenario.id !== 'right-restraint', scenario.id);
});

test('content scenarios create distinct destination, package and trusted FAQ questions on their landing pages', () => {
  const expectations = [
    { id: 'right-moment', intent: 'DESTINATION_COMPARISON', page: '/compare', question: /compare Maldives and Bali by trip style/ },
    { id: 'package-selection', intent: 'PACKAGE_SELECTION', page: '/packages/bali-slow-living', question: /compare Bali Slow Living and Island Rhythm by nights, pace, inclusions and illustrative price/ },
    { id: 'travel-information', intent: 'TRAVEL_INFORMATION', page: '/travel-info?destination=japan', question: /For Japan: How do I check entry requirements for Japan\?/ },
  ];
  const questions = new Set<string>();
  for (const expected of expectations) {
    const scenario = demoScenarios.find(item => item.id === expected.id);
    assert.ok(scenario);
    const events = journeyEvents(scenario.events);
    const context = buildJourneyContext(events);
    const decision = decideAssistance(context);
    assert.equal(decision.assistanceType, expected.intent);
    assert.equal(scenario.landingPage, expected.page);
    const question = conciergeOpeningMessage(contextualHandoff(buildHandoff(context, decision, 's'), events));
    assert.match(question, expected.question);
    questions.add(question);
  }
  assert.equal(questions.size, expectations.length);
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
  assert.equal(pageForEvent('PACKAGE_VIEW', 'bali-slow-living'), '/packages/bali-slow-living');
  assert.equal(pageForEvent('PRICE_VIEW', 'island-rhythm'), '/packages/island-rhythm');
  assert.equal(pageForEvent('FAQ_SEARCH', 'japan-entry'), '/travel-info?destination=japan');
  assert.equal(pageForEvent('TRAVEL_INFO_VIEW', 'japan'), '/travel-info?destination=japan');
});
