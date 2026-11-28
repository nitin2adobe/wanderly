import assert from 'node:assert/strict';
import test from 'node:test';
import { adobeConnector, CONCIERGE_OPEN_EVENT, type ConciergeOpenRequest } from './concierge-connector.ts';
import type { ConciergeHandoff } from './concierge-handoff.ts';
import { travelResult } from '../sites/wanderly/contract-examples.ts';

const handoff: ConciergeHandoff = {
  version: 1, brand: 'wanderly', intent: 'DESTINATION_COMPARISON', entities: ['Bali', 'Maldives'],
  observedSignals: ['Compared destinations'], explicitPreferences: {}, entryPoint: 'proactive_invitation',
  sessionId: 'test-session', createdAt: '2026-01-01T00:00:00.000Z',
};
async function withWindow(run: (target: EventTarget) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  try { await run(target); }
  finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('connector waits for SDK acknowledgement, not event receipt, without forwarding full handoff', () => withWindow(async target => {
  let request!: ConciergeOpenRequest;
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => {
    event.preventDefault();
    request = (event as CustomEvent<ConciergeOpenRequest>).detail;
  });
  let finished = false;
  const pending = adobeConnector.open(handoff, { initialMessage: 'Question', activationId: 'a1' }).then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal('handoff' in request, false);
  assert.equal('sessionId' in request, false);
  assert.equal(request.initialMessage, 'Question');
  request.resolve({ status: 'opened' });
  assert.equal((await pending).status, 'opened');
}));

test('connector surfaces asynchronous SDK failure and unavailable listeners', () => withWindow(async target => {
  await assert.rejects(adobeConnector.open(handoff), /not available/);
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => {
    event.preventDefault();
    (event as CustomEvent<ConciergeOpenRequest>).detail.reject(new Error('SDK failed'));
  });
  await assert.rejects(adobeConnector.open(handoff), /SDK failed/);
}));

test('connector supports cancellation without claiming success', () => withWindow(async target => {
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => event.preventDefault());
  const controller = new AbortController();
  const pending = adobeConnector.open(handoff, { signal: controller.signal });
  controller.abort();
  assert.equal((await pending).status, 'cancelled');
}));

test('unconfigured brand is rejected', () => withWindow(async () => {
  await assert.rejects(adobeConnector.open({ ...handoff, brand: 'electronics-demo' }), /not configured/);
}));

test('typed starters force visitor submission even if a caller requests automatic activation', () => withWindow(async target => {
  target.addEventListener(CONCIERGE_OPEN_EVENT, event => {
    event.preventDefault();
    const request = (event as CustomEvent<ConciergeOpenRequest>).detail;
    assert.equal(request.automatic, false);
    assert.deepEqual(request.starterResult, travelResult);
    request.resolve({ status: 'opened' });
  });
  assert.equal((await adobeConnector.openStarters!(travelResult, { automatic: true })).status, 'opened');
}));
