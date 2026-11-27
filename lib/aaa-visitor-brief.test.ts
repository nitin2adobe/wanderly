import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitorBriefStore } from './aaa-visitor-brief.ts';

test('visitor briefs stay in memory only while their activation remains fresh', () => {
  const store = createVisitorBriefStore();
  let fresh = true;
  const token = store.set('Comparing two destinations', () => fresh);
  assert.equal(store.get(), 'Comparing two destinations');
  fresh = false;
  assert.equal(store.get(), undefined);
  fresh = true;
  assert.equal(store.get(), undefined);
  const next = store.set('New visit', () => true);
  store.clear(token);
  assert.equal(store.get(), 'New visit');
  store.clear(next);
  assert.equal(store.get(), undefined);
  assert.equal(store.set('x'.repeat(401), () => true), undefined);
  assert.equal(store.set('No freshness check'), undefined);
});
