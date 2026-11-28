import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonRequest } from './aaa-comparison.ts';
import { travelJourney, travelProfile } from '../sites/wanderly/contract-examples.ts';

test('comparison bypasses exposure only and does not manufacture an assist moment', () => {
  const input = {
    journey: travelJourney, profile: travelProfile,
    moment: { id: 'compare', decision: 'ASSIST' },
    suppression: { allowed: false, reasonCodes: ['exposure.limit' as const, 'exposure.cooldown' as const] },
  };
  assert.equal(comparisonRequest(input, 'request', '2026-01-01T00:00:00Z')?.momentRuleId, 'compare');
  for (const reason of ['consent.denied', 'profile.unavailable', 'transaction.active', 'transaction.uncertain', 'form.focused', 'journey.uncertain'] as const) {
    assert.equal(comparisonRequest({ ...input, suppression: { allowed: false, reasonCodes: [reason] } }, 'request', '2026-01-01T00:00:00Z'), undefined);
  }
  assert.equal(comparisonRequest({ ...input, moment: { id: 'booking', decision: 'SUPPRESS' } }, 'request', '2026-01-01T00:00:00Z'), undefined);
  assert.equal(comparisonRequest({ ...input, suppression: { allowed: false, reasonCodes: [] } }, 'request', '2026-01-01T00:00:00Z'), undefined);
  assert.equal(comparisonRequest({ ...input, profile: { ...travelProfile, profileVersion: '9.0.0' } }, 'request', '2026-01-01T00:00:00Z'), undefined);
});
