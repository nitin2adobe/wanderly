import assert from 'node:assert/strict';
import test from 'node:test';
import { assistanceCopy } from './assistance-copy.ts';
import { decideAssistance } from './assistance-decision.ts';
import { evaluatePolicy } from './assistance-policy.ts';
import { adaptEvents, electronicsAdapter, type ElectronicsEvent } from './brand-adapters.ts';
import { buildHandoff, validateHandoff } from './concierge-handoff.ts';
import { buildJourneyContext } from './journey-context.ts';

const NOW = new Date('2026-01-01T00:00:00Z');
const run = (raw: ElectronicsEvent[]) => {
  const events = adaptEvents(electronicsAdapter, raw, 'e-session');
  const context = buildJourneyContext(events);
  const decision = decideAssistance(context);
  return { context, decision, policy: evaluatePolicy(decision, context, events, NOW) };
};

test('electronics: repeated product switching plus spec comparison activates the concierge', () => {
  const { context, decision, policy } = run([
    { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' }, { type: 'PRODUCT_VIEW', sku: 'laptop-air-13' }, { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' },
    { type: 'SPEC_COMPARE' }, { type: 'PRODUCT_VIEW', sku: 'laptop-air-13' },
  ]);
  assert.equal(policy.allowed, true);
  const handoff = buildHandoff(context, decision, 'e-session', NOW, electronicsAdapter.brand);
  assert.equal(handoff.brand, 'electronics-demo');
  assert.deepEqual(handoff.entities, ['Laptop Pro 14', 'Laptop Air 13']);
  assert.equal(validateHandoff(handoff).valid, true);
  assert.equal(assistanceCopy(handoff.intent, handoff.entities).headline, 'Need help comparing Laptop Pro 14 and Laptop Air 13?');
});

test('electronics: repeated warranty questions activate information help', () => {
  const { decision, policy } = run([
    { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' }, { type: 'WARRANTY_FAQ', question: 'Does it cover battery?' }, { type: 'WARRANTY_FAQ', question: 'Is accidental damage covered?' },
  ]);
  assert.equal(decision.assistanceType, 'TRAVEL_INFORMATION');
  assert.equal(policy.allowed, true);
});

test('electronics: starting checkout after comparing stays silent, and unknown events are ignored', () => {
  const { decision, policy } = run([
    { type: 'HEARTBEAT' }, { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' }, { type: 'PRODUCT_VIEW', sku: 'laptop-air-13' }, { type: 'SPEC_COMPARE' },
    { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' }, { type: 'CHECKOUT_START' },
  ]);
  assert.equal(decision.decision, 'SILENT');
  assert.equal(policy.allowed, false);
});
