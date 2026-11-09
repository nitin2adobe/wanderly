import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePresenterParam } from './presenter-mode.ts';

test('present query parameter turns presenter mode on or off', () => {
  assert.equal(parsePresenterParam('?present=1'), true);
  assert.equal(parsePresenterParam('?run=right-moment&present=1'), true);
  assert.equal(parsePresenterParam('?present=0'), false);
});

test('anything else leaves presenter mode unchanged', () => {
  assert.equal(parsePresenterParam(''), null);
  assert.equal(parsePresenterParam('?present=yes'), null);
  assert.equal(parsePresenterParam('?run=right-moment'), null);
});
