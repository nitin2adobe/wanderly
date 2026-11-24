import assert from 'node:assert/strict';
import test from 'node:test';
import { conciergeOpeningMessage, MAX_OPENING_MESSAGE_LENGTH } from './concierge-message.ts';
import { conciergeIntents } from './concierge-handoff.ts';
import { conciergePageDestination, contextualHandoff, defaultConciergeWelcomeExamples, manualConciergeSuggestion } from './concierge-context.ts';
import { destinations } from './data.ts';
import type { ConciergeHandoff } from './concierge-handoff.ts';
import { journeyEvents } from './labelled-journeys.ts';

const handoff = (intent: ConciergeHandoff['intent'], entities: string[] = []): ConciergeHandoff => ({
  version: 1, brand: 'wanderly', intent, entities, explicitPreferences: {},
  observedSignals: [], entryPoint: 'proactive_invitation', sessionId: 's', createdAt: '2026-01-01T00:00:00Z',
});

test('fresh welcome examples cover the current catalog, including Thailand and Portugal', () => {
  const examples = defaultConciergeWelcomeExamples();
  assert.equal(examples.length, destinations.length);
  assert.ok(destinations.every(destination => examples.some(question => question.includes(destination.name))));
  assert.ok(examples.some(question => question.includes('Thailand')));
  assert.ok(examples.some(question => question.includes('Portugal')));
});

test('Japan welcome alternatives use approved practical questions and exclude stale destinations and raw events', () => {
  const events = journeyEvents([['DESTINATION_VIEW', 'bali'], ['FAQ_SEARCH', 'bali-entry'], ['FAQ_SEARCH', 'private-freeform-input']]);
  const suggestion = manualConciergeSuggestion(events, '/travel-info', '?destination=japan', ['bali', 'maldives']);
  const examples = suggestion?.welcomeExamples ?? [];
  assert.ok(examples.length >= 2);
  assert.ok(examples.every(question => question.includes('Japan')));
  assert.ok(examples.includes('For Japan: How do I check entry requirements for Japan?'));
  assert.doesNotMatch(examples.join(' '), /Bali|Maldives|private-freeform/);
});

test('welcome alternatives follow trusted package names and the active comparison shortlist', () => {
  const events = journeyEvents([['PACKAGE_VIEW', 'island-rhythm'], ['PACKAGE_VIEW', 'cities-seasons']]);
  const pack = manualConciergeSuggestion(events, '/packages/cities-seasons');
  assert.ok(pack?.welcomeExamples.some(question => question.includes('Cities & Seasons')));
  assert.doesNotMatch(pack?.welcomeExamples.join(' ') ?? '', /Island Rhythm|Bali/);
  const compare = manualConciergeSuggestion(events, '/compare', '', ['portugal', 'thailand', 'unknown-input']);
  assert.ok(compare?.welcomeExamples.length);
  assert.ok(compare?.welcomeExamples.every(question => question.includes('Portugal') && question.includes('Thailand')));
  assert.doesNotMatch(compare?.welcomeExamples.join(' ') ?? '', /Bali|Japan|unknown-input/);
});

test('suggested questions are neutral, contextual and do not impersonate a typed visitor request', () => {
  const comparison = conciergeOpeningMessage(handoff('DESTINATION_COMPARISON', ['Bali', 'Maldives']));
  assert.equal(comparison, 'Help compare Bali and Maldives by trip style, travel logistics and trade-offs.');
  const packages = conciergeOpeningMessage(handoff('PACKAGE_SELECTION', ['Island Rhythm', 'Bali Slow Living']));
  assert.match(packages, /Island Rhythm and Bali Slow Living.*nights, pace, inclusions and illustrative price/);
  assert.doesNotMatch(comparison + packages, /I'm|My main/);
});

test('priority survives length reduction, entities are sanitized and messages stay bounded', () => {
  for (const intent of conciergeIntents) {
    const text = conciergeOpeningMessage({ ...handoff(intent, ['X'.repeat(240), 'Y'.repeat(240)]), explicitPreferences: { priority: 'BUDGET' } });
    assert.ok(text.length <= MAX_OPENING_MESSAGE_LENGTH);
    assert.match(text, /explicitly chosen priority is budget/);
  }
  assert.match(conciergeOpeningMessage(handoff('DESTINATION_COMPARISON', ['<Bali>', 'Bali', ' Maldives ', 'Japan', 'Switzerland'])), /Bali, Maldives and Japan/);
});

test('active shortlist replaces historical entities, with most-recent browsing as fallback', () => {
  const original = handoff('DESTINATION_COMPARISON', ['Bali', 'Maldives', 'Japan']);
  const events = journeyEvents([['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'japan'], ['DESTINATION_VIEW', 'portugal']]);
  assert.deepEqual(contextualHandoff(original, events, ['portugal', 'thailand']).entities, ['Portugal', 'Thailand']);
  assert.deepEqual(contextualHandoff(original, events).entities, ['Portugal', 'Japan', 'Bali']);
});

test('recent package entities resolve to canonical display names and ignore unknown inputs', () => {
  const events = journeyEvents([['PACKAGE_VIEW', 'island-rhythm'], ['PACKAGE_VIEW', 'cities-seasons'], ['PACKAGE_VIEW', 'bali-slow-living'], ['PACKAGE_VIEW', 'cities-seasons'], ['PACKAGE_VIEW', 'private-freeform-input']]);
  const result = contextualHandoff(handoff('PACKAGE_SELECTION'), events);
  assert.deepEqual(result.entities, ['Cities & Seasons', 'Bali Slow Living', 'Island Rhythm']);
  assert.doesNotMatch(conciergeOpeningMessage(result), /private-freeform/);
});

test('real practical topic uses approved question text, not raw FAQ events or obsolete destination', () => {
  const events = journeyEvents([['DESTINATION_VIEW', 'bali'], ['FAQ_SEARCH', 'japan-luggage']]);
  const result = contextualHandoff(handoff('TRAVEL_INFORMATION'), events);
  assert.equal(conciergeOpeningMessage(result), 'For Japan: What should I check about luggage and walking?');
  const switched = contextualHandoff(handoff('TRAVEL_INFORMATION'), [...events, ...journeyEvents([['TRAVEL_INFO_VIEW', 'portugal']])]);
  assert.deepEqual(switched.entities, ['Portugal']);
  assert.equal(switched.topic, undefined);
});

test('the current Japan page overrides stale destination shortlist and FAQ context', () => {
  const events = journeyEvents([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'],
    ['FAQ_SEARCH', 'bali-entry'], ['DESTINATION_VIEW', 'japan'],
  ]);
  const active = conciergePageDestination('/destinations/japan');
  assert.equal(active?.slug, 'japan');
  for (const intent of ['DESTINATION_COMPARISON', 'TRAVEL_INFORMATION'] as const) {
    const question = conciergeOpeningMessage(contextualHandoff(handoff(intent), events, ['bali', 'maldives'], active?.slug));
    assert.match(question, /Japan/);
    assert.doesNotMatch(question, /Bali|Maldives/);
  }
  const entry = contextualHandoff(handoff('TRAVEL_INFORMATION'), [...events, ...journeyEvents([['FAQ_SEARCH', 'japan-entry']])], ['bali'], active?.slug);
  assert.equal(conciergeOpeningMessage(entry), 'For Japan: How do I check entry requirements for Japan?');
  assert.deepEqual(contextualHandoff(handoff('DESTINATION_COMPARISON'), events, ['bali', 'maldives']).entities, ['Bali', 'Maldives']);
});

test('Japan package and information routes resolve current destination without copying historical Bali packages', () => {
  assert.equal(conciergePageDestination('/packages/cities-seasons')?.slug, 'japan');
  assert.equal(conciergePageDestination('/travel-info', '?destination=japan')?.slug, 'japan');
  assert.equal(conciergePageDestination('/packages', '?destination=japan')?.slug, 'japan');
  assert.equal(conciergePageDestination('/compare'), undefined);
  assert.equal(conciergePageDestination('/destinations/private-input'), undefined);
  const events = journeyEvents([['PACKAGE_VIEW', 'island-rhythm'], ['PACKAGE_VIEW', 'cities-seasons'], ['PACKAGE_VIEW', 'japan-food-trails']]);
  const result = contextualHandoff(handoff('PACKAGE_SELECTION'), events, ['bali'], 'japan');
  assert.deepEqual(result.entities, ['Japan Food Trails', 'Cities & Seasons']);
  assert.doesNotMatch(conciergeOpeningMessage(result), /Island Rhythm|Bali|Maldives/);
  const noJapanPackages = contextualHandoff(handoff('PACKAGE_SELECTION'), journeyEvents([['PACKAGE_VIEW', 'island-rhythm']]), [], 'japan');
  assert.equal(conciergeOpeningMessage(noJapanPackages, ['Japan']), 'Explain the package options for Japan and their trade-offs.');
});

test('manual openings use recent Japan FAQ clicks and actual package names rather than a page-only default', () => {
  const faqEvents = journeyEvents([['DESTINATION_VIEW', 'japan'], ['FAQ_SEARCH', 'japan-entry']]);
  const faq = manualConciergeSuggestion(faqEvents, '/travel-info', '?destination=japan', ['bali', 'maldives']);
  assert.equal(faq?.initialMessage, 'For Japan: How do I check entry requirements for Japan?');
  assert.match(faq?.explanation ?? '', /practical question you opened for Japan/);
  const packEvents = journeyEvents([
    ['DESTINATION_VIEW', 'japan'], ['PACKAGE_VIEW', 'cities-seasons'], ['PRICE_VIEW', 'cities-seasons'],
    ['PACKAGE_VIEW', 'japan-food-trails'], ['PRICE_VIEW', 'japan-food-trails'],
  ]);
  const pack = manualConciergeSuggestion(packEvents, '/packages/japan-food-trails');
  assert.match(pack?.initialMessage ?? '', /Japan Food Trails and Cities & Seasons.*nights, pace, inclusions and illustrative price/);
  assert.match(pack?.explanation ?? '', /recent package and price views for Japan/);
});

test('manual context follows trusted stay clicks and information-selector changes without echoing unknown inputs', () => {
  const stays = journeyEvents([['DESTINATION_VIEW', 'japan'], ['HOTEL_VIEW', 'Tokyo neighbourhood hotel']]);
  const stay = manualConciergeSuggestion(stays, '/destinations/japan');
  assert.equal(stay?.initialMessage, 'For Japan: What should I check about the Tokyo neighbourhood hotel stay style?');
  const selected = journeyEvents([['TRAVEL_INFO_VIEW', 'bali'], ['TRAVEL_INFO_VIEW', 'japan'], ['FAQ_SEARCH', 'japan-luggage']]).map(event => ({ ...event, page: '/travel-info' }));
  const info = manualConciergeSuggestion(selected, '/travel-info', '?destination=bali');
  assert.equal(info?.initialMessage, 'For Japan: What should I check about luggage and walking?');
  const unknown = manualConciergeSuggestion([...selected, ...journeyEvents([['FAQ_SEARCH', 'private-freeform-input']])], '/travel-info', '?destination=japan');
  assert.doesNotMatch(unknown?.initialMessage ?? '', /private-freeform|Bali|Maldives/);
});

test('manual context respects comparison scope, explicit preferences and an empty journey', () => {
  const events = journeyEvents([['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW']]);
  const comparison = manualConciergeSuggestion(events, '/compare', '', ['bali', 'maldives']);
  assert.match(comparison?.initialMessage ?? '', /compare Bali and Maldives/);
  const preferred = manualConciergeSuggestion([...events, {
    id: 'priority', sessionId: 's', timestamp: new Date().toISOString(), eventType: 'ASSISTANCE_PREFERENCE',
    page: '/', metadata: { priority: 'BUDGET' },
  }], '/destinations/japan', '', ['bali', 'maldives']);
  assert.match(preferred?.initialMessage ?? '', /Japan.*explicitly chosen priority is budget/);
  assert.doesNotMatch(preferred?.initialMessage ?? '', /Bali|Maldives/);
  assert.equal(manualConciergeSuggestion([], '/'), undefined);
});

test('a new information-page visit prevents an old Bali FAQ from overriding the Japan URL', () => {
  const oldVisit = journeyEvents([['TRAVEL_INFO_VIEW', 'bali'], ['FAQ_SEARCH', 'bali-entry']]).map(event => ({ ...event, page: '/travel-info?destination=bali' }));
  const page: Parameters<typeof manualConciergeSuggestion>[0][number] = {
    id: 'new-visit', sessionId: 's', timestamp: new Date().toISOString(),
    eventType: 'PAGE_VIEW', page: '/travel-info?destination=japan',
  };
  const suggestion = manualConciergeSuggestion([...oldVisit, page], '/travel-info', '?destination=japan');
  assert.match(suggestion?.initialMessage ?? '', /Japan/);
  assert.doesNotMatch(suggestion?.initialMessage ?? '', /Bali|entry requirements/);
  assert.equal(conciergePageDestination('/travel-info')?.slug, 'japan');
});
