import assert from 'node:assert/strict';
import test from 'node:test';
import { summariseOutcomes } from './assistance-outcomes.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';

const ev = (eventType: WanderlyEventType, metadata?: Record<string, unknown>): WanderlyEvent =>
  ({ id: Math.random().toString(36), sessionId: 's', timestamp: '2026-01-01T00:00:00Z', eventType, page: '/', metadata });
const type = { assistanceType: 'DESTINATION_COMPARISON' };

test('accepted invitation records the preference and later progression', () => {
  const [outcome] = summariseOutcomes([
    ev('ASSISTANCE_SHOWN', { ...type, source: 'rules' }), ev('ASSISTANCE_ACCEPTED', type),
    ev('ASSISTANCE_PREFERENCE', { ...type, priority: 'BUDGET' }), ev('DATE_SEARCH'),
  ]);
  assert.deepEqual(outcome, { assistanceType: 'DESTINATION_COMPARISON', source: 'rules', response: 'ACCEPTED', priority: 'BUDGET', progressedAfter: true });
});

test('dismissed, withdrawn and unanswered invitations are distinguished', () => {
  const outcomes = summariseOutcomes([
    ev('ASSISTANCE_SHOWN', type), ev('ASSISTANCE_DISMISSED', { ...type, reason: 'visitor' }),
    ev('ASSISTANCE_SHOWN', { assistanceType: 'PACKAGE_SELECTION' }), ev('ASSISTANCE_DISMISSED', { assistanceType: 'PACKAGE_SELECTION', reason: 'withdrawn' }),
    ev('ASSISTANCE_SHOWN', { assistanceType: 'TRAVEL_INFORMATION' }),
  ]);
  assert.deepEqual(outcomes.map(o => o.response), ['DISMISSED', 'WITHDRAWN', 'NO_RESPONSE']);
  assert.deepEqual(outcomes.map(o => o.progressedAfter), [false, false, false]);
});

test('no invitations yields no outcomes', () => {
  assert.deepEqual(summariseOutcomes([ev('DESTINATION_VIEW')]), []);
});
