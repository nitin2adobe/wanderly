import assert from 'node:assert/strict';
import test from 'node:test';
import { assistanceCopy, formatList } from './assistance-copy.ts';
import { conciergeIntents } from './concierge-handoff.ts';

test('formatList handles 0, 1, 2 and 3+ entities and ignores blanks and duplicates', () => {
  assert.equal(formatList([]), '');
  assert.equal(formatList(['Bali']), 'Bali');
  assert.equal(formatList(['Bali', 'Maldives']), 'Bali and Maldives');
  assert.equal(formatList(['Bali', 'Maldives', 'Japan']), 'Bali, Maldives and Japan');
  assert.equal(formatList(['Bali', ' ', 'Bali']), 'Bali');
});

test('comparison copy names the compared destinations', () => {
  const copy = assistanceCopy('DESTINATION_COMPARISON', ['Bali', 'Maldives']);
  assert.equal(copy.headline, 'Need help comparing Bali and Maldives?');
  assert.equal(copy.cta, 'Compare options');
  assert.equal(assistanceCopy('DESTINATION_COMPARISON', ['Bali', 'Maldives', 'Japan']).headline, 'Need help comparing Bali, Maldives and Japan?');
  assert.equal(assistanceCopy('DESTINATION_COMPARISON', ['Bali']).headline, 'Need help choosing a destination?');
});

test('copy never contains empty placeholders or presumes confusion', () => {
  for (const intent of conciergeIntents) {
    for (const entities of [[], ['Bali'], ['Bali', 'Maldives'], ['Bali', 'Maldives', 'Japan']]) {
      const copy = assistanceCopy(intent, entities);
      const text = Object.values(copy).join(' ');
      assert.doesNotMatch(text, /undefined|null|\s{2,}|\(\)|for \?/);
      assert.doesNotMatch(text, /confus|struggl|lost/i);
      assert.ok(copy.headline && copy.body && copy.cta && copy.dismiss);
    }
  }
});
