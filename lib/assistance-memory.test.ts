import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMemory } from './assistance-memory.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';

const ev = (eventType: WanderlyEventType, metadata?: Record<string, unknown>): WanderlyEvent =>
  ({ id: Math.random().toString(36), sessionId: 's', timestamp: '2026-01-01T00:00:00Z', eventType, page: '/', metadata });

test('an empty session has no memory', () => {
  assert.deepEqual(deriveMemory([]), { visitorDismissals: 0, acceptedTypes: [] });
});

test('visitor dismissals are counted but plugin withdrawals are not', () => {
  const memory = deriveMemory([
    ev('ASSISTANCE_DISMISSED', { reason: 'visitor' }), ev('ASSISTANCE_DISMISSED', { reason: 'withdrawn' }),
    ev('ASSISTANCE_DISMISSED', { reason: 'unrestorable' }), ev('ASSISTANCE_DISMISSED', {}),
  ]);
  assert.equal(memory.visitorDismissals, 2);
});

test('accepted types and the latest valid preference are remembered', () => {
  const memory = deriveMemory([
    ev('ASSISTANCE_ACCEPTED', { assistanceType: 'DESTINATION_COMPARISON' }),
    ev('ASSISTANCE_PREFERENCE', { priority: 'BUDGET' }), ev('ASSISTANCE_PREFERENCE', { priority: 'bogus' }), ev('ASSISTANCE_PREFERENCE', { priority: 'ACTIVITIES' }),
  ]);
  assert.deepEqual(memory.acceptedTypes, ['DESTINATION_COMPARISON']);
  assert.equal(memory.preferredPriority, 'ACTIVITIES');
});
