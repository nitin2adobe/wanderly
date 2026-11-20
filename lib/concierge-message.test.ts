import assert from 'node:assert/strict';
import test from 'node:test';
import { conciergeOpeningMessage, MAX_OPENING_MESSAGE_LENGTH } from './concierge-message.ts';
import { conciergeIntents } from './concierge-handoff.ts';

const message = (intent: typeof conciergeIntents[number], entities: string[], priority?: 'BUDGET' | 'ACTIVITIES' | 'TRIP_LENGTH') =>
  conciergeOpeningMessage({ intent, entities, explicitPreferences: priority ? { priority } : {} });

test('comparison names the compared destinations in the visitor voice', () => {
  assert.equal(message('DESTINATION_COMPARISON', ['Bali', 'Maldives']), "I'm comparing Bali and Maldives. Can you help me decide which suits me better?");
  assert.equal(message('DESTINATION_COMPARISON', ['Bali']), "I'm trying to choose a destination. Can you help me narrow it down?");
});

test('package and travel messages use viewed entities', () => {
  assert.equal(message('PACKAGE_SELECTION', ['Island Rhythm', 'Cities Seasons']), "I'm looking at the Island Rhythm and Cities Seasons packages. What's the difference?");
  assert.equal(message('PACKAGE_SELECTION', ['Barefoot Blue']), "I'm looking at the Barefoot Blue package. Are there other options I should consider?");
  assert.equal(message('PACKAGE_SELECTION', []), 'Can you help me choose a travel package?');
  assert.equal(conciergeOpeningMessage({ intent: 'PACKAGE_SELECTION', entities: [], explicitPreferences: {} }, ['Maldives']), 'Are there other packages for Maldives?');
  assert.equal(conciergeOpeningMessage({ intent: 'PACKAGE_SELECTION', entities: ['Barefoot Blue'], explicitPreferences: {} }, ['Maldives']), "I'm looking at the Barefoot Blue package. Are there other options I should consider?");
  assert.equal(message('TRAVEL_INFORMATION', ['Japan']), "I'm planning a trip to Japan. What should I know before I go?");
});

test('adds an explicitly chosen priority', () => {
  assert.equal(message('DESTINATION_COMPARISON', ['Bali', 'Maldives'], 'BUDGET'), "I'm comparing Bali and Maldives. Can you help me decide which suits me better? My main priority is budget.");
});

test('sanitises, deduplicates, caps entities and never exceeds the length limit', () => {
  assert.equal(message('DESTINATION_COMPARISON', ['<Bali>', 'Bali', ' Maldives ', 'Japan', 'Switzerland']), "I'm comparing Bali, Maldives and Japan. Can you help me decide which suits me better?");
  for (const intent of conciergeIntents) {
    const text = message(intent, ['X'.repeat(240), 'Y'.repeat(240)], 'TRIP_LENGTH');
    assert.ok(text.length <= MAX_OPENING_MESSAGE_LENGTH);
    assert.doesNotMatch(text, /undefined|null|\s{2,}/);
  }
});
