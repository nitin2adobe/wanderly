import assert from 'node:assert/strict';
import test from 'node:test';
import { metadataAllowlist, minimizeEvent, redactMetadata, redactPage, redactUrl } from './aaa-privacy.ts';
import { packages } from './data.ts';
import type { WanderlyEvent } from './events.ts';

const base = { id: 'e1', sessionId: 's1', timestamp: '2026-11-26T10:00:00.000Z' };

test('browsing events keep no metadata: form contents, free text and account IDs are dropped', () => {
  const event = minimizeEvent({
    ...base, eventType: 'BOOKING_STEP', page: '/booking', entity: 'bali',
    metadata: { email: 'visitor@example.com', travellerName: 'Ana', searchText: 'cheap trip for 2', accountId: 'acct-42', dietary: 'halal' },
  } as WanderlyEvent);
  assert.deepEqual(event, { ...base, eventType: 'BOOKING_STEP', page: '/booking', entity: 'bali' });
});

test('raw query strings and fragments are removed; only a catalog destination ID survives', () => {
  assert.equal(redactPage('/booking?destination=bali&email=a%40b.com#x'), '/booking?destination=bali');
  assert.equal(redactPage('/travel-info?q=visa+for+my+passport'), '/travel-info');
  assert.equal(redactPage('/booking?destination=my%20home%20address'), '/booking');
  assert.equal(redactUrl('https://user:pw@demo.test/destinations/japan?utm=x&q=free+text#top'), 'https://demo.test/destinations/japan');
});

test('free-text entities are rejected; opaque IDs are kept', () => {
  assert.equal(minimizeEvent({ ...base, eventType: 'PACKAGE_VIEW', page: '/', entity: 'my wife and I want quiet' }).entity, undefined);
  assert.equal(minimizeEvent({ ...base, eventType: 'PACKAGE_VIEW', page: '/', entity: packages[0].id }).entity, packages[0].id);
  assert.equal(minimizeEvent({ ...base, eventType: 'PACKAGE_VIEW', page: '/', entity: 'visitor@example.com' }).entity, undefined);
  assert.equal(minimizeEvent({ ...base, eventType: 'PACKAGE_VIEW', page: '/', entity: 'acct-123' }).entity, undefined);
  assert.equal(redactPage('/account/visitor@example.com'), '/');
  assert.equal(redactPage('/booking?destination=acct-123'), '/booking');
});

test('assistance metadata keeps only allow-listed, correctly typed fields', () => {
  assert.deepEqual(redactMetadata('ASSISTANCE_QUERY_SUBMITTED', {
    activationId: '1f0c2d3e-aaaa-4bbb-8ccc-123456789abc', assistanceType: 'TRAVEL_INFORMATION', questionKind: 'visitor', queryNumber: 2,
    query: 'my passport number is X123', conversationId: 'not an id because spaces',
  }), { activationId: '1f0c2d3e-aaaa-4bbb-8ccc-123456789abc', assistanceType: 'TRAVEL_INFORMATION', questionKind: 'visitor', queryNumber: 2 });
  assert.deepEqual(redactMetadata('ASSISTANCE_FEEDBACK', { feedback: 'meh', comment: 'free text' }), undefined);
  assert.deepEqual(redactMetadata('ASSISTANCE_PREFERENCE', { priority: 'BUDGET', income: 'high' }), { priority: 'BUDGET' });
  assert.equal(redactMetadata('ASSISTANCE_EVALUATED', { contextKey: 'not json' }), undefined);
  assert.equal(redactMetadata('ASSISTANCE_REQUESTED', { handoff: { version: 1, topic: 'anything' } }), undefined);
});

test('every event type has an explicit allowlist', () => {
  for (const [type, keys] of Object.entries(metadataAllowlist)) assert.ok(Array.isArray(keys), type);
});

test('nested valid-looking payloads cannot smuggle text or arbitrary properties into the stored event', () => {
  const sessionId = 'w_abc_123';
  const event = minimizeEvent({
    ...base, sessionId, eventType: 'ASSISTANCE_REQUESTED', page: '/',
    metadata: {
      activationId: 'visitor@example.com', reason: 'acct-123',
      handoff: {
        version: 1, brand: 'wanderly', intent: 'TRAVEL_INFORMATION',
        entities: ['Japan', 'visitor@example.com'], topic: 'private medical details',
        observedSignals: ['private account details'], explicitPreferences: { priority: 'BUDGET', accountId: '123' },
        entryPoint: 'proactive_invitation', sessionId, createdAt: '2026-11-26T10:00:00Z',
        extra: 'private',
      },
    },
  });
  assert.deepEqual(event.metadata, { handoff: {
    version: 1, brand: 'wanderly', intent: 'TRAVEL_INFORMATION', entities: ['Japan'],
    observedSignals: [], explicitPreferences: { priority: 'BUDGET' }, entryPoint: 'proactive_invitation',
    sessionId, createdAt: '2026-11-26T10:00:00Z',
  } });
  assert.equal(redactMetadata('ASSISTANCE_EVALUATED', {
    decision: { headline: 'private', reason: 'private', evidence: ['private'] },
    contextKey: '{"private":"visitor@example.com"}', policy: { reason: 'private' },
  }), undefined);
});
