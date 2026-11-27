import assert from 'node:assert/strict';
import test from 'node:test';
import { nudgeWhy } from './aaa-nudge-copy.ts';

test('nudge explanation uses validated response text or the static fallback', () => {
  assert.equal(nudgeWhy('You compared Bali and Maldives.'), 'You compared Bali and Maldives.');
  assert.match(nudgeWhy(undefined), /matches an assistance rule/);
  assert.match(nudgeWhy('unsafe\ntext'), /matches an assistance rule/);
});
