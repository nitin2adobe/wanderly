import assert from 'node:assert/strict';
import test from 'node:test';
import { readTimingSequence, saveTimingSequence } from './aaa-timing-budget.ts';

test('session timing budget survives reload and fails closed on corrupt storage', () => {
  let value: string | null = null;
  const storage = { getItem: () => value, setItem: (_key: string, text: string) => { value = text; } };
  assert.equal(readTimingSequence(storage, 'one'), 0);
  assert.equal(saveTimingSequence(storage, 'one', 19), true);
  assert.equal(readTimingSequence(storage, 'one'), 19);
  assert.equal(readTimingSequence(storage, 'two'), 0);
  value = '{"sequence":999}';
  assert.equal(readTimingSequence(storage, 'one'), undefined);
  assert.equal(saveTimingSequence({ ...storage, setItem: () => { throw new Error('unavailable'); } }, 'one', 20), false);
});
