import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAssistance } from './assistance-decision.ts';
import { defaultPolicy, evaluatePolicy } from './assistance-policy.ts';
import { buildJourneyContext } from './journey-context.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { sanitizePolicyOptions } from './policy-settings.ts';

test('garbage or missing settings fall back to the defaults', () => {
  assert.deepEqual(sanitizePolicyOptions(null), defaultPolicy);
  assert.deepEqual(sanitizePolicyOptions('x'), defaultPolicy);
  assert.deepEqual(sanitizePolicyOptions({ minConfidence: 'high', cooldownMs: NaN, maxInvitationsPerSession: {} }), defaultPolicy);
});

test('out-of-range values are clamped so the gate cannot be disabled', () => {
  const clamped = sanitizePolicyOptions({ minConfidence: 0, cooldownMs: -5, maxInvitationsPerSession: 99 });
  assert.equal(clamped.minConfidence, 0.5);
  assert.equal(clamped.cooldownMs, 0);
  assert.equal(clamped.maxInvitationsPerSession, 5);
  const high = sanitizePolicyOptions({ minConfidence: 5, cooldownMs: 9_999_999, maxInvitationsPerSession: 0 });
  assert.equal(high.minConfidence, 0.99);
  assert.equal(high.cooldownMs, 600_000);
  assert.equal(high.maxInvitationsPerSession, 1);
});

test('valid values are kept and rounded sensibly', () => {
  assert.deepEqual(sanitizePolicyOptions({ minConfidence: 0.873, cooldownMs: 30_400, maxInvitationsPerSession: 3.4 }), { minConfidence: 0.87, cooldownMs: 30_000, maxInvitationsPerSession: 3 });
});

test('evaluatePolicy honours the sanitized overrides', () => {
  const context = buildJourneyContext(journeyEvents([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]));
  const decision = decideAssistance(context);
  assert.equal(evaluatePolicy(decision, context, [], new Date(), sanitizePolicyOptions({ minConfidence: 0.8 })).allowed, true);
  assert.equal(evaluatePolicy(decision, context, [], new Date(), sanitizePolicyOptions({ minConfidence: 0.95 })).rule, 'LOW_CONFIDENCE');
});
