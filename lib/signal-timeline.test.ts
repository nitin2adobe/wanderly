import assert from 'node:assert/strict';
import test from 'node:test';
import type { WanderlyEventType } from './events.ts';
import { journeyEvents } from './labelled-journeys.ts';
import { buildSignalTimeline } from './signal-timeline.ts';

const timeline = (items: Array<[WanderlyEventType, string?]>) => buildSignalTimeline(journeyEvents(items));

test('comparison journey moves from WAIT to ASSIST and the flip is marked', () => {
  const steps = timeline([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]);
  assert.equal(steps.length, 5);
  assert.equal(steps[0].decision, 'SILENT');
  assert.ok(steps.some(s => s.decision === 'WAIT'));
  const assist = steps.findIndex(s => s.decision === 'ASSIST');
  assert.ok(assist > 0);
  assert.equal(steps[assist].flipped, true);
  assert.equal(steps[assist].policyRule, 'ALLOWED');
  assert.equal(steps[assist].assistanceType, 'DESTINATION_COMPARISON');
});

test('forward progression flips ASSIST back to SILENT at the date search', () => {
  const steps = timeline([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DATE_SEARCH'], ['BOOKING_START'],
  ]);
  assert.equal(steps[3].decision, 'ASSIST');
  assert.equal(steps[4].decision, 'SILENT');
  assert.equal(steps[4].flipped, true);
  assert.equal(steps[4].policyRule, 'NOT_ASSIST');
  assert.equal(steps[5].flipped, false);
});

test('page views and assistance lifecycle events are not timeline steps', () => {
  const steps = timeline([['SESSION_START'], ['PAGE_VIEW'], ['DESTINATION_VIEW', 'bali'], ['ASSISTANCE_SHOWN'], ['ASSISTANCE_DISMISSED']]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].flipped, false);
});

test('policy overrides change the policy rule shown for a step', () => {
  const events = journeyEvents([
    ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
  ]);
  const strict = buildSignalTimeline(events, { minConfidence: 0.95, maxInvitationsPerSession: 2, cooldownMs: 120_000 });
  assert.ok(strict.some(s => s.decision === 'ASSIST' && s.policyRule === 'LOW_CONFIDENCE'));
});
