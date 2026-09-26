import assert from 'node:assert/strict';
import test from 'node:test';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';
import { decideAssistance } from './assistance-decision.ts';
import { validateAssistanceDecision, validateJourneyContext } from './assistance-schema.ts';

let sequence = 0;
function events(items: Array<[WanderlyEventType, string?]>): WanderlyEvent[] {
  return items.map(([eventType, entity]) => ({
    id: `test-${sequence++}`,
    sessionId: 'test-session',
    timestamp: new Date(sequence * 1000).toISOString(),
    eventType,
    page: '/',
    entity,
  }));
}

function decision(items: Array<[WanderlyEventType, string?]>) {
  const context = buildJourneyContext(events(items));
  assert.equal(validateJourneyContext(context).valid, true);
  return decideAssistance(context);
}

test('scenario 1: healthy direct journey stays silent', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'maldives'], ['HOTEL_VIEW', 'resort'], ['DATE_SEARCH'], ['BOOKING_START'],
  ]).decision, 'SILENT');
});

test('scenario 2: unresolved destination comparison assists', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'],
    ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]).decision, 'ASSIST');
});

test('scenario 3: repeated information seeking assists', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW', 'visa'], ['DESTINATION_VIEW', 'japan'],
    ['FAQ_SEARCH', 'visa'], ['TRAVEL_INFO_VIEW', 'entry-requirements'],
  ]).decision, 'ASSIST');
});

test('scenario 4: early pricing exploration waits', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'],
    ['HOTEL_VIEW', 'resort'], ['PRICE_VIEW'],
  ]).decision, 'WAIT');
});

test('scenario 5: pricing friction plus comparison assists', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'],
    ['HOTEL_VIEW', 'resort'], ['PRICE_VIEW'], ['COMPARE_VIEW'],
  ]).decision, 'ASSIST');
});

test('scenario 6: resolved comparison followed by booking stays silent', () => {
  assert.equal(decision([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'],
    ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START'],
  ]).decision, 'SILENT');
});

test('baseline decisions conform to the canonical decision schema', () => {
  const result = decision([['DESTINATION_VIEW', 'bali']]);
  assert.equal(validateAssistanceDecision(result).valid, true);
});
