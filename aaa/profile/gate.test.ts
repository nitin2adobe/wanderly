import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoConsentAuthority } from '../../lib/aaa-consent.ts';
import { travelProfile } from '../../sites/wanderly/contract-examples.ts';
import { aaaAvailability } from './gate.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from './loader.ts';

const memoryStore = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test('AAA requires both granted consent and an active valid profile', () => {
  const consent = createDemoConsentAuthority(memoryStore());
  const profiles = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY, createCorrelationId: () => 'corr-1' });
  const current = () => aaaAvailability(consent.get(), profiles.state());

  assert.deepEqual(current(), { enabled: false, reason: 'consent.pending' });
  assert.equal(profiles.publish(travelProfile).ok, true);
  assert.deepEqual(current(), { enabled: false, reason: 'consent.pending' });

  consent.decide('granted');
  const enabled = current();
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.enabled && enabled.active.exposure.maxNudgesPerSession, 2);

  assert.equal(profiles.publish('{').ok, false);
  assert.deepEqual(current(), { enabled: false, reason: 'profile.unavailable', diagnostic: (profiles.state() as { diagnostic: unknown }).diagnostic });
  assert.equal(profiles.rollback().ok, true);
  assert.equal(current().enabled, true);

  consent.decide('denied');
  assert.deepEqual(current(), { enabled: false, reason: 'consent.denied' });
});

test('consent is checked before profile diagnostics and unknown values fail closed', () => {
  const profiles = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY, createCorrelationId: () => 'corr-1' });
  profiles.publish('{');
  for (const consent of ['pending', undefined, 'GRANTED', true]) {
    assert.deepEqual(aaaAvailability(consent, profiles.state()), { enabled: false, reason: 'consent.pending' });
  }
  assert.deepEqual(aaaAvailability('denied', profiles.state()), { enabled: false, reason: 'consent.denied' });
});
