import assert from 'node:assert/strict';
import test from 'node:test';
import { travelProfile } from '../aaa/contracts/examples/travel.ts';
import type { ConsentAuthority, ConsentState } from './aaa-consent.ts';
import { createAaaRuntime, gateJourneyStore } from './aaa-runtime.ts';
import { createJourneyStore } from './journey-store.ts';
import { createAmbientContextHook } from './ambient-context.ts';
import { EVENT_STORAGE_KEY } from './events.ts';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

function fakeConsent(initial: ConsentState = 'pending') {
  let state = initial;
  const listeners = new Set<(s: ConsentState) => void>();
  const authority: ConsentAuthority = {
    kind: 'demo-banner',
    get: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { authority, set(next: ConsentState) { state = next; listeners.forEach(l => l(next)); } };
}

const invalidProfile = { ...travelProfile, schemaVersion: '9.9.9' };

function setup(consentState: ConsentState, profile: unknown) {
  const consent = fakeConsent(consentState);
  const aaa = createAaaRuntime({ consent: () => consent.authority, profile });
  const session = memoryStore();
  let clock = 1_000_000;
  let n = 0;
  const raw = createJourneyStore({ session, isGranted: () => consent.authority.get() === 'granted', now: () => clock, makeId: p => `${p}_${++n}` });
  const store = gateJourneyStore(raw, aaa.isEnabled);
  return { consent, aaa, session, store, advance: (ms: number) => { clock += ms; } };
}

test('granted consent with a valid profile enables collection', () => {
  const { aaa, store } = setup('granted', travelProfile);
  assert.equal(aaa.get().enabled, true);
  assert.ok(store.track('PAGE_VIEW', '/'));
  assert.equal(store.getEvents().length, 1);
  assert.ok(store.getSessionId());
});

test('granted consent with an invalid profile disables collection, reads and ambient context', () => {
  const { aaa, store, session } = setup('granted', invalidProfile);
  const availability = aaa.get();
  assert.equal(availability.enabled, false);
  assert.equal(!availability.enabled && availability.reason, 'profile.unavailable');
  assert.equal(store.track('PAGE_VIEW', '/'), undefined);
  assert.deepEqual(store.getEvents(), []);
  assert.equal(store.getSessionId(), '');
  assert.deepEqual(store.currentJourney(), { sessionId: '', events: [] });
  assert.equal(session.data.size, 0);
  const options: { xdm?: Record<string, unknown> } = { xdm: {} };
  createAmbientContextHook(() => ({ url: '/', path: '/', title: 'Home' }), 'marker', undefined, aaa.isEnabled)(options);
  assert.deepEqual(options.xdm, {});
});

test('consent is checked before the profile and pending consent never exposes diagnostics', () => {
  assert.deepEqual(setup('pending', invalidProfile).aaa.get(), { enabled: false, reason: 'consent.pending' });
  assert.deepEqual(setup('denied', travelProfile).aaa.get(), { enabled: false, reason: 'consent.denied' });
});

test('an invalid publish safely disables collection; held data still expires and can be purged', () => {
  const { aaa, store, session, advance } = setup('granted', travelProfile);
  store.track('PAGE_VIEW', '/');
  assert.equal(aaa.publish(invalidProfile).ok, false);
  assert.equal(aaa.isEnabled(), false);
  assert.equal(store.track('PAGE_VIEW', '/x'), undefined);
  assert.deepEqual(store.getEvents(), []);
  assert.ok(session.data.has(EVENT_STORAGE_KEY), 'unavailability is not a purge');
  advance(31 * 60_000);
  assert.equal(store.sweep(), true);
  assert.equal(session.data.has(EVENT_STORAGE_KEY), false);

  const other = setup('granted', travelProfile);
  other.store.track('PAGE_VIEW', '/');
  other.aaa.publish(invalidProfile);
  other.store.purge();
  assert.equal(other.session.data.size, 0);
});

const activeVersion = (aaa: ReturnType<typeof createAaaRuntime>) => {
  const availability = aaa.get();
  return availability.enabled ? availability.active.profile.profileVersion : undefined;
};

test('subscribers hear consent and profile changes; rollback restores the previous version', () => {
  const { consent, aaa } = setup('pending', travelProfile);
  let calls = 0;
  const unsubscribe = aaa.subscribe(() => { calls++; });
  consent.set('granted');
  assert.equal(aaa.isEnabled(), true);
  assert.equal(aaa.publish({ ...travelProfile, profileVersion: '1.0.1' }).ok, true);
  assert.equal(activeVersion(aaa), '1.0.1');
  assert.equal(aaa.publish(invalidProfile).ok, false);
  assert.equal(aaa.isEnabled(), false);
  assert.equal(aaa.rollback().ok, true);
  assert.equal(activeVersion(aaa), '1.0.1');
  assert.equal(aaa.rollback().ok, true);
  assert.equal(activeVersion(aaa), travelProfile.profileVersion);
  assert.equal(calls, 5);
  assert.equal(aaa.get(), aaa.get(), 'snapshots are stable for useSyncExternalStore');
  unsubscribe();
  consent.set('denied');
  assert.equal(calls, 5);
});

test('a failed diagnostic generator still notifies subscribers that the profile was disabled', () => {
  const consent = fakeConsent('granted');
  const aaa = createAaaRuntime({ consent: () => consent.authority, profile: travelProfile, createCorrelationId: () => 'invalid id' });
  let calls = 0;
  const unsubscribe = aaa.subscribe(() => { calls++; });
  assert.throws(() => aaa.publish(invalidProfile), /Invalid correlation ID/);
  assert.equal(aaa.isEnabled(), false);
  assert.equal(calls, 1);
  unsubscribe();
});
