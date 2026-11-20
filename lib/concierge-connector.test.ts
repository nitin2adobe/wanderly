import assert from 'node:assert/strict';
import test from 'node:test';
import { adobeConnector, CONCIERGE_OPEN_EVENT } from './concierge-connector.ts';
import type { ConciergeHandoff } from './concierge-handoff.ts';

const handoff: ConciergeHandoff = {
  version: 1,
  brand: 'wanderly',
  intent: 'DESTINATION_COMPARISON',
  entities: ['Bali', 'Maldives'],
  observedSignals: ['Compared destinations'],
  explicitPreferences: {},
  entryPoint: 'proactive_invitation',
  sessionId: 'test-session',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function withWindow(run: (target: EventTarget) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  try {
    run(target);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('opens the Adobe chat without forwarding the invitation payload', () => withWindow(target => {
  let received: Event | undefined;
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => {
    received = event;
    event.preventDefault();
  });
  adobeConnector.open(handoff);
  assert.ok(received);
  assert.equal('detail' in received, false);
  assert.equal(adobeConnector.supportsBrand('wanderly'), true);
}));

test('fails explicitly when the Adobe chat is not mounted', () => withWindow(() => {
  assert.throws(() => adobeConnector.open(handoff), /not available/);
}));

test('requests only the generic greeting, not the journey payload', () => withWindow(target => {
  let detail: unknown;
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => {
    detail = (event as CustomEvent).detail;
    event.preventDefault();
  });
  adobeConnector.open(handoff, { initialMessage: 'Hi' });
  assert.deepEqual(detail, { initialMessage: 'Hi' });
}));

test('does not open the Wanderly chat for an unconfigured brand', () => withWindow(target => {
  let received = false;
  target.addEventListener(CONCIERGE_OPEN_EVENT, () => { received = true; });
  assert.equal(adobeConnector.supportsBrand('electronics-demo'), false);
  assert.throws(() => adobeConnector.open({ ...handoff, brand: 'electronics-demo' }), /not configured/);
  assert.equal(received, false);
}));
