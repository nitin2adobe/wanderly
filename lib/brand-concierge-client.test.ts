import assert from 'node:assert/strict';
import test from 'node:test';
import { createConciergeClient, type ConciergeClientEvent } from './brand-concierge-client.ts';

function fixture({
  ready = Promise.resolve(),
  submit = true,
}: { ready?: Promise<void>; submit?: boolean } = {}) {
  const attributes = new Map<string, string>();
  const messages: (string | undefined)[] = [];
  let onEvent: (event: ConciergeClientEvent) => void = () => {};
  let available = true;
  let failure: Error | undefined;
  const client = createConciergeClient({
    ready,
    mount: {
      setAttribute: (key, value) => { attributes.set(key, value); },
      removeAttribute: key => { attributes.delete(key); },
    },
    canOpen: () => available,
    bootstrap: callback => {
      onEvent = callback;
      const message = attributes.get('data-initial-message');
      messages.push(message);
      if (failure) throw failure;
      if (message && submit) onEvent({ eventType: 'query:submitted', data: { query: message } });
    },
  });
  return {
    client, attributes, messages,
    emit: (event: ConciergeClientEvent) => onEvent(event),
    leavePage: () => { available = false; },
    fail: (error?: Error) => { failure = error; },
  };
}

test('waits for SDK readiness and sends one Hi for concurrent activation requests', async () => {
  let resolve!: () => void;
  const f = fixture({ ready: new Promise<void>(done => { resolve = done; }) });
  const first = f.client.open('Hi');
  const duplicate = f.client.open('Hi');
  await Promise.resolve();
  assert.deepEqual(f.messages, []);
  resolve();
  await Promise.all([first, duplicate]);
  assert.deepEqual(f.messages, ['Hi']);
  assert.equal(f.attributes.has('data-initial-message'), false);
});

test('opening manually does not submit a greeting; automatic assistance can start an empty chat', async () => {
  const f = fixture();
  await f.client.open();
  await f.client.open('Hi');
  assert.deepEqual(f.messages, [undefined, 'Hi']);
});

test('automatic assistance preserves a conversation the visitor already started', async () => {
  const f = fixture();
  await f.client.open();
  f.emit({ eventType: 'query:submitted', data: { query: 'My question' } });
  await f.client.open('Hi');
  assert.deepEqual(f.messages, [undefined]);
});

test('clearing chat history allows a later greeting', async () => {
  const f = fixture();
  await f.client.open('Hi');
  f.emit({ eventType: 'history:cleared' });
  await f.client.open('Hi');
  assert.deepEqual(f.messages, ['Hi', 'Hi']);
});

test('does not submit queued assistance after leaving the page or unmounting', async () => {
  for (const cancel of ['route', 'unmount']) {
    let resolve!: () => void;
    const f = fixture({ ready: new Promise<void>(done => { resolve = done; }) });
    const opening = f.client.open('Hi');
    if (cancel === 'route') f.leavePage();
    else f.client.dispose();
    resolve();
    assert.equal(await opening, false);
    assert.deepEqual(f.messages, []);
  }
});

test('bootstrap failure is surfaced, cleans the greeting attribute and permits retry', async () => {
  const f = fixture();
  f.fail(new Error('Network unavailable'));
  await assert.rejects(f.client.open('Hi'), /Network unavailable/);
  assert.equal(f.attributes.has('data-initial-message'), false);
  f.fail();
  await f.client.open('Hi');
  assert.deepEqual(f.messages, ['Hi', 'Hi']);
});

test('an SDK change that stops auto submission is an explicit error', async () => {
  const f = fixture({ submit: false });
  await assert.rejects(f.client.open('Hi'), /did not submit/);
  assert.equal(f.attributes.has('data-initial-message'), false);
});
