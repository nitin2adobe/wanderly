import assert from 'node:assert/strict';
import test from 'node:test';
import { destinations, filterDestinations, filterPackages, getBookingSelection, getPackage, getPackagesForDestination, packages } from './data.ts';
import { pageSignals } from './page-signals.ts';
import { getBrandConfig } from './brand-config.ts';
import { decideAssistance } from './assistance-decision.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import type { WanderlyEventType } from './events.ts';

test('every expanded package has a unique route, destination, and consistent duration', () => {
  assert.equal(new Set(packages.map(pack => pack.id)).size, packages.length);
  for (const destination of destinations) {
    const choices = getPackagesForDestination(destination.slug);
    assert.ok(choices.length >= 2, `${destination.name} needs a meaningful package choice`);
    assert.ok(new Set(choices.map(pack => pack.priceValue)).size > 1);
    for (const pack of choices) {
      assert.equal(getPackage(pack.id), pack);
      assert.equal(pack.days, `${pack.nights} nights`);
      assert.equal(pack.price, `$${pack.priceValue.toLocaleString('en-US')}`);
    }
  }
});

test('destination search combines words with mood and handles empty results', () => {
  assert.deepEqual(filterDestinations('  JAPAN food ', 'Culture').map(item => item.slug), ['japan']);
  assert.ok(filterDestinations('food', 'All').some(item => item.slug === 'thailand'));
  assert.deepEqual(filterDestinations('Atlantis', 'All'), []);
  assert.deepEqual(filterDestinations('Japan', 'Beach'), []);
});

test('package filters intersect destination, pace and price', () => {
  assert.deepEqual(filterPackages('bali', 'Relaxed', 3000).map(pack => pack.id), ['bali-slow-living']);
  assert.deepEqual(filterPackages('maldives', 'All', 2200), []);
  assert.ok(filterPackages('all', 'Active', 5000).every(pack => pack.pace === 'Active'));
});

test('booking links preserve package context and reject unknown or mismatched selections', () => {
  assert.equal(getBookingSelection(undefined, 'lisbon-coast')?.destination.slug, 'portugal');
  assert.equal(getBookingSelection('bali')?.destination.slug, 'bali');
  assert.equal(getBookingSelection()?.destination.slug, 'maldives');
  assert.equal(getBookingSelection('japan', 'island-rhythm'), undefined);
  assert.equal(getBookingSelection('atlantis'), undefined);
  assert.equal(getBookingSelection(undefined, 'missing-package'), undefined);
});

test('direct package routes produce catalog identity and pricing signals without booking progression', () => {
  assert.deepEqual(pageSignals('/packages/bali-slow-living'), [
    { eventType: 'PACKAGE_VIEW', entity: 'bali-slow-living' },
    { eventType: 'PRICE_VIEW', entity: 'bali-slow-living' },
  ]);
  assert.deepEqual(pageSignals('/booking'), []);
  assert.deepEqual(pageSignals('/packages/missing-package'), []);
});

test('concierge catalog lookup resolves normalized new package names and preserves legacy destination lookup', () => {
  const brand = getBrandConfig('wanderly')!;
  assert.match(brand.lookup('Lagoon Retreat', 'BUDGET', 'PACKAGE_SELECTION')?.detail ?? '', /\$4,290/);
  assert.match(brand.lookup('Cities Seasons', 'BUDGET', 'PACKAGE_SELECTION')?.detail ?? '', /\$2,790/);
  assert.match(brand.lookup('Maldives', 'BUDGET', 'PACKAGE_SELECTION')?.detail ?? '', /Barefoot Blue is \$3,180/);
});

test('real package navigation can assist on backtracking and stays silent after planning progress', () => {
  const signals = ['/packages/island-rhythm', '/packages/bali-slow-living', '/packages/island-rhythm']
    .flatMap(route => pageSignals(route))
    .map(({ eventType, entity }): [WanderlyEventType, string?] => [eventType, entity]);
  const comparison = decideAssistance(buildJourneyContext(journeyEvents(signals)));
  assert.equal(comparison.decision, 'ASSIST');
  assert.equal(comparison.assistanceType, 'PACKAGE_SELECTION');
  const progressing = decideAssistance(buildJourneyContext(journeyEvents([...signals, ['DATE_SEARCH'], ['BOOKING_START']])));
  assert.equal(progressing.decision, 'SILENT');
});
