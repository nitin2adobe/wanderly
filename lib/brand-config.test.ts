import assert from 'node:assert/strict';
import test from 'node:test';
import { assistanceCopy } from './assistance-copy.ts';
import { brandConfigs, brandIdForPath, electronicsCatalog, getBrandConfig } from './brand-config.ts';
import type { ConciergeHandoff } from './concierge-handoff.ts';
import { openConcierge, replyToPriority } from './mock-concierge.ts';

const handoff = (brand: string, entities: string[], intent: ConciergeHandoff['intent'] = 'DESTINATION_COMPARISON'): ConciergeHandoff => ({
  version: 1, brand, intent, entities, observedSignals: ['Repeated product switching.'],
  explicitPreferences: {}, entryPoint: 'proactive_invitation', sessionId: 's', createdAt: '2026-01-01T00:00:00.000Z',
});

test('brand ids resolve from routes and configs', () => {
  assert.equal(brandIdForPath('/demo/electronics'), 'electronics-demo');
  assert.equal(brandIdForPath('/destinations/bali'), 'wanderly');
  assert.equal(brandIdForPath(null), 'wanderly');
  assert.ok(getBrandConfig('wanderly') && getBrandConfig('electronics-demo'));
  assert.equal(getBrandConfig('unknown'), undefined);
  for (const [id, config] of Object.entries(brandConfigs)) assert.equal(config.id, id);
});

test('electronics concierge uses brand labels and catalog data', () => {
  const h = handoff('electronics-demo', ['Laptop Pro 14', 'Laptop Air 13']);
  const opening = openConcierge(h);
  assert.deepEqual(opening.quickReplies.map(q => q.label), ['Price', 'Features', 'Warranty']);
  assert.match(opening.message, /Laptop Pro 14 and Laptop Air 13/);
  const price = replyToPriority(h, 'BUDGET');
  assert.match(price.facts[0].detail, /\$1,899/);
  assert.match(price.facts[1].detail, /\$1,199/);
  assert.match(replyToPriority(h, 'TRIP_LENGTH').facts[0].detail, /3-year warranty/);
  assert.equal(price.facts[0].image, undefined);
});

test('no travel vocabulary leaks into the electronics brand', () => {
  const h = handoff('electronics-demo', electronicsCatalog.map(p => p.name));
  const visible = [openConcierge(h).message, ...openConcierge(h).quickReplies.map(q => q.label)];
  for (const priority of ['BUDGET', 'ACTIVITIES', 'TRIP_LENGTH'] as const) {
    const reply = replyToPriority(h, priority);
    visible.push(reply.message, reply.followUp, ...reply.facts.map(f => f.detail));
  }
  assert.doesNotMatch(visible.join(' '), /Bali|Maldives|Japan|Switzerland|trip|nights|destination|Budget|Activities/i);
});

test('wanderly behaviour is unchanged by the brand layer', () => {
  const h = handoff('wanderly', ['Bali', 'Maldives']);
  assert.deepEqual(openConcierge(h).quickReplies.map(q => q.label), ['Budget', 'Activities', 'Trip length']);
  assert.match(replyToPriority(h, 'BUDGET').facts[0].detail, /\$1,890/);
});

test('unknown brands are rejected by the concierge', () => {
  assert.throws(() => openConcierge(handoff('mystery-shop', ['X'])), /Unknown brand/);
});

test('brand copy overrides replace travel-flavoured invitation wording', () => {
  const electronics = getBrandConfig('electronics-demo')!;
  assert.equal(assistanceCopy('TRAVEL_INFORMATION', ['Laptop Pro 14'], electronics).headline, 'Questions about Laptop Pro 14?');
  assert.equal(assistanceCopy('PACKAGE_SELECTION', ['Laptop Pro 14', 'Laptop Air 13'], electronics).cta, 'Compare products');
  assert.equal(assistanceCopy('DESTINATION_COMPARISON', ['Laptop Pro 14', 'Laptop Air 13'], electronics).headline, 'Need help comparing Laptop Pro 14 and Laptop Air 13?');
  assert.equal(assistanceCopy('TRAVEL_INFORMATION', ['Japan']).headline, 'Looking for travel details for Japan?');
});
