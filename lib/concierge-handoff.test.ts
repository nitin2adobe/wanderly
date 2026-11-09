import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { buildHandoff, validateHandoff } from './concierge-handoff.ts';
import type { WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';

const context = (items: Array<[WanderlyEventType, string?]>) => buildJourneyContext(journeyEvents(items));
const comparison: Array<[WanderlyEventType, string?]> = [
  ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
];

test('builds a handoff with entities and observed signals for an ASSIST decision', () => {
  const c = context(comparison);
  const d = decideAssistance(c);
  assert.equal(d.decision, 'ASSIST');
  const handoff = buildHandoff(c, d, 'session-1', new Date('2026-01-01T00:00:00Z'));
  assert.equal(handoff.brand, 'wanderly');
  assert.equal(handoff.intent, 'DESTINATION_COMPARISON');
  assert.deepEqual(handoff.entities, ['Bali', 'Maldives']);
  assert.ok(handoff.observedSignals.length > 0);
  assert.deepEqual(handoff.explicitPreferences, {});
  assert.equal(handoff.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(validateHandoff(handoff).valid, true);
});

test('travel-information handoffs use viewed destinations', () => {
  const c = context([['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW'], ['FAQ_SEARCH']]);
  const handoff = buildHandoff(c, decideAssistance(c), 's');
  assert.equal(handoff.intent, 'TRAVEL_INFORMATION');
  assert.deepEqual(handoff.entities, ['Japan']);
});

test('refuses to build a handoff for SILENT and WAIT decisions', () => {
  const silent = context([['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']]);
  const wait = context([['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'maldives']]);
  assert.equal(decideAssistance(silent).decision, 'SILENT');
  assert.equal(decideAssistance(wait).decision, 'WAIT');
  assert.throws(() => buildHandoff(silent, decideAssistance(silent), 's'), /ASSIST/);
  assert.throws(() => buildHandoff(wait, decideAssistance(wait), 's'), /ASSIST/);
});

test('validator rejects malformed handoffs', () => {
  const c = context(comparison);
  const good = buildHandoff(c, decideAssistance(c), 's');
  assert.equal(validateHandoff(null).valid, false);
  assert.equal(validateHandoff({ ...good, version: 2 }).valid, false);
  assert.equal(validateHandoff({ ...good, brand: ' ' }).valid, false);
  assert.equal(validateHandoff({ ...good, intent: 'NONE' }).valid, false);
  assert.equal(validateHandoff({ ...good, entities: [''] }).valid, false);
  assert.equal(validateHandoff({ ...good, sessionId: '' }).valid, false);
  assert.equal(validateHandoff({ ...good, createdAt: 'nope' }).valid, false);
  assert.equal(validateHandoff({ ...good, explicitPreferences: { priority: 'LUXURY' } }).valid, false);
  assert.equal(validateHandoff({ ...good, explicitPreferences: { priority: 'BUDGET' } }).valid, true);
});
