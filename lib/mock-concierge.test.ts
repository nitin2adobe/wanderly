import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConciergeHandoff } from './concierge-handoff.ts';
import { openConcierge, replyToPriority } from './mock-concierge.ts';

const handoff = (entities: string[], intent: ConciergeHandoff['intent'] = 'DESTINATION_COMPARISON'): ConciergeHandoff => ({
  version: 1, brand: 'wanderly', intent, entities, observedSignals: ['Repeated destination switching.'],
  explicitPreferences: {}, entryPoint: 'proactive_invitation', sessionId: 's', createdAt: '2026-01-01T00:00:00.000Z',
});

test('the opening message is driven by the handoff entities', () => {
  assert.match(openConcierge(handoff(['Bali', 'Maldives'])).message, /Bali and Maldives/);
  const japan = openConcierge(handoff(['Japan', 'Switzerland']));
  assert.match(japan.message, /Japan and Switzerland/);
  assert.doesNotMatch(japan.message, /Bali|Maldives/);
  assert.deepEqual(japan.quickReplies.map(r => r.label), ['Budget', 'Activities', 'Trip length']);
});

test('replies come from curated data for each handoff entity', () => {
  const budget = replyToPriority(handoff(['Japan', 'Switzerland']), 'BUDGET');
  assert.deepEqual(budget.facts.map(f => f.entity), ['Japan', 'Switzerland']);
  assert.match(budget.facts[0].detail, /\$2,320/);
  assert.match(budget.facts[1].detail, /\$2,560/);
  assert.match(replyToPriority(handoff(['Bali', 'Maldives']), 'ACTIVITIES').facts[1].detail, /Overwater villa/);
  assert.match(replyToPriority(handoff(['Bali']), 'TRIP_LENGTH').facts[0].detail, /7 nights/);
});

test('package intents quote package prices', () => {
  const reply = replyToPriority(handoff(['Maldives'], 'PACKAGE_SELECTION'), 'BUDGET');
  assert.match(reply.facts[0].detail, /Barefoot Blue is \$3,180/);
});

test('replies include a destination image only for known destinations', () => {
  const facts = replyToPriority(handoff(['Bali', 'Atlantis']), 'BUDGET').facts;
  assert.match(facts[0].image ?? '', /^https:/);
  assert.equal(facts[1].image, undefined);
});

test('a carried-over priority is acknowledged in the opening', () => {
  assert.equal(openConcierge(handoff(['Bali'])).note, undefined);
  const note = openConcierge({ ...handoff(['Bali', 'Maldives']), explicitPreferences: { priority: 'BUDGET' } }).note;
  assert.match(note ?? '', /budget matters most/);
});

test('unknown entities are acknowledged, not invented', () => {
  assert.match(replyToPriority(handoff(['Atlantis']), 'BUDGET').facts[0].detail, /don't have details/);
});

test('invalid handoffs and priorities are rejected', () => {
  assert.throws(() => openConcierge({ intent: 'NONE' }), /Invalid concierge handoff/);
  assert.throws(() => replyToPriority(null, 'BUDGET'), /Invalid concierge handoff/);
  assert.throws(() => replyToPriority(handoff(['Bali']), 'LUXURY' as never), /Unknown priority/);
});
