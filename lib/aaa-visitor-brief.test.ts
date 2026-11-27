import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitorBriefStore, visitorBriefIsFresh } from './aaa-visitor-brief.ts';
import profile from '../sites/wanderly/profile.json' with { type: 'json' };

test('visitor briefs stay in memory only while their activation remains fresh', () => {
  const store = createVisitorBriefStore();
  let fresh = true;
  const token = store.set('Comparing two destinations', () => fresh);
  assert.equal(store.get(), 'Comparing two destinations');
  assert.equal(store.get(false), undefined);
  assert.equal(store.get(true), 'Comparing two destinations');
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

test('brief freshness is scoped to the session, profile and expiry rather than page', () => {
  const identity = { sessionId: 'session', profileId: profile.profileId, profileVersion: profile.profileVersion };
  const now = Date.parse('2026-01-01T00:00:00Z');
  const expiry = '2026-01-01T00:01:00Z';
  assert.equal(visitorBriefIsFresh(identity, expiry, identity, now), true);
  assert.equal(visitorBriefIsFresh(identity, expiry, { ...identity, sessionId: 'other' }, now), false);
  assert.equal(visitorBriefIsFresh(identity, expiry, { ...identity, profileVersion: '1.4.0' }, now), false);
  assert.equal(visitorBriefIsFresh(identity, expiry, identity, Date.parse(expiry)), false);
  assert.equal(visitorBriefIsFresh(identity, 'invalid', identity, now), false);
  assert.equal(visitorBriefIsFresh(identity, expiry, undefined, now), false);
});
