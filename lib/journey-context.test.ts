import assert from 'node:assert/strict';
import test from 'node:test';
import type { WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';

const build = (items: Array<[WanderlyEventType, string?]>) => buildJourneyContext(journeyEvents(items));

test('page views and session starts are not semantic signals', () => {
  const context = build([['SESSION_START'], ['PAGE_VIEW']]);
  assert.equal(context.semanticEventCount, 0);
  assert.equal(context.potentialFriction, 'NONE');
});

test('destination switches count only changes between consecutive views', () => {
  const context = build([['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali']]);
  assert.equal(context.destinationSwitches, 2);
  assert.deepEqual(context.destinationsViewed, ['Bali', 'Maldives']);
});

test('a date search is forward progression even without comparison', () => {
  assert.equal(build([['DESTINATION_VIEW', 'switzerland'], ['TRAVEL_INFO_VIEW'], ['FAQ_SEARCH'], ['DATE_SEARCH']]).journeyProgression, 'POSITIVE');
});

test('booking progression levels follow the furthest booking event', () => {
  assert.equal(build([['BOOKING_START']]).bookingProgression, 'LOW');
  assert.equal(build([['BOOKING_START'], ['BOOKING_STEP']]).bookingProgression, 'MEDIUM');
  assert.equal(build([['BOOKING_COMPLETE']]).bookingProgression, 'HIGH');
});

test('repeated switching without comparison is negative progression', () => {
  const context = build([['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'japan'], ['DESTINATION_VIEW', 'bali']]);
  assert.equal(context.journeyProgression, 'NEGATIVE');
});
