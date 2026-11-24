import assert from 'node:assert/strict';
import test from 'node:test';
import { createConciergeClient, withConciergeSuggestion, type ConciergeClientEvent } from './brand-concierge-client.ts';

function fixture({ ready = Promise.resolve(), legacy = false, acknowledge = true, delay = 0, timeoutMs = 100 }: {
  ready?: Promise<void>; legacy?: boolean; acknowledge?: boolean; delay?: number; timeoutMs?: number;
} = {}) {
  const attributes = new Map<string, string>();
  const messages: (string | undefined)[] = [];
  const suggestions: (string | undefined)[] = [];
  const examples: (readonly string[] | undefined)[] = [];
  let onEvent: (event: ConciergeClientEvent) => void = () => {};
  let available = true;
  let failure: Error | undefined;
  const client = createConciergeClient({
    ready, legacyAutoSubmit: legacy, timeoutMs,
    mount: { setAttribute: (key, value) => { attributes.set(key, value); }, removeAttribute: key => { attributes.delete(key); } },
    canOpen: () => available,
    bootstrap: (callback, question, welcomeExamples) => {
      onEvent = callback;
      const message = attributes.get('data-initial-message');
      messages.push(message);
      suggestions.push(question);
      examples.push(welcomeExamples);
      if (failure) throw failure;
      if (acknowledge) {
        const emit = () => callback(legacy && message ? { eventType: 'query:submitted', data: { query: message } } : { eventType: 'webclient:initialized' });
        if (delay) setTimeout(emit, delay);
        else emit();
      }
    },
  });
  return { client, attributes, messages, suggestions, examples, emit: (event: ConciergeClientEvent) => onEvent(event), leavePage: () => { available = false; }, fail: (error?: Error) => { failure = error; } };
}

test('default uses documented welcome suggestions without auto submitting', async () => {
  const f = fixture();
  assert.deepEqual(await f.client.open('Compare these trips'), { status: 'opened' });
  assert.deepEqual(f.messages, [undefined]);
  assert.deepEqual(f.suggestions, ['Compare these trips']);
  const config = { theme: { color: 'green' }, arrays: { other: [1] } };
  assert.deepEqual(withConciergeSuggestion(config, 'Question'), { theme: { color: 'green' }, arrays: { other: [1], 'welcome.examples': [{ text: 'Question' }] } });
  assert.equal('welcome.examples' in config.arrays, false);
});

test('unsent welcome suggestions refresh when the current destination changes without duplicate opens', async () => {
  const f = fixture({ delay: 5 });
  await f.client.open('Compare Bali and Maldives');
  const results = await Promise.all([f.client.open('Explore Japan'), f.client.open('Explore Japan')]);
  assert.deepEqual(results.map(result => result.status), ['opened', 'existing']);
  assert.deepEqual(f.suggestions, ['Compare Bali and Maldives', 'Explore Japan']);
  assert.deepEqual(f.messages, [undefined, undefined]);
});

test('clearing destination scope restores the default welcome rather than retaining a scoped question', async () => {
  const f = fixture();
  await f.client.open('Explore Japan');
  assert.equal((await f.client.open(undefined, undefined, false)).status, 'opened');
  assert.equal((await f.client.open(undefined, undefined, false)).status, 'existing');
  assert.deepEqual(f.suggestions, ['Explore Japan', undefined]);
});

test('a submitted conversation is preserved when a Japan question replaces an earlier suggestion', async () => {
  const f = fixture();
  await f.client.open('Compare Bali and Maldives');
  f.emit({ eventType: 'query:submitted', data: { query: 'Visitor question' } });
  assert.equal((await f.client.open('Explore Japan')).status, 'existing');
  assert.deepEqual(f.suggestions, ['Compare Bali and Maldives']);
});

test('dynamic example lists retain the primary question, deduplicate and preserve other styling', () => {
  const config = { arrays: { other: [1], 'welcome.examples': [{ text: 'Old default' }] } };
  assert.deepEqual(withConciergeSuggestion(config, 'Explore Japan', ['Explore Japan', ' Japan luggage? ', 'Japan entry?', '']), {
    arrays: { other: [1], 'welcome.examples': [{ text: 'Explore Japan' }, { text: 'Japan luggage?' }, { text: 'Japan entry?' }] },
  });
  assert.deepEqual(config.arrays['welcome.examples'], [{ text: 'Old default' }]);
});

test('changed secondary examples refresh an unsent welcome but preserve a submitted conversation', async () => {
  const f = fixture();
  assert.equal((await f.client.open('Explore Japan', undefined, false, ['Japan entry?'])).status, 'opened');
  assert.equal((await f.client.open('Explore Japan', undefined, false, ['Japan luggage?'])).status, 'opened');
  assert.equal((await f.client.open('Explore Japan', undefined, false, ['Japan luggage?'])).status, 'existing');
  f.emit({ eventType: 'query:submitted', data: { query: 'Visitor question' } });
  assert.equal((await f.client.open('Explore Japan', undefined, false, ['Japan stays?'])).status, 'existing');
  assert.deepEqual(f.examples, [['Japan entry?'], ['Japan luggage?']]);
  assert.deepEqual(f.messages, [undefined, undefined]);
  f.emit({ eventType: 'history:cleared' });
  assert.equal((await f.client.open('Explore Japan', undefined, false, ['Japan stays?'])).status, 'opened');
});

test('legacy mode awaits a delayed matching callback and deduplicates concurrent requests', async () => {
  const f = fixture({ legacy: true, delay: 10 });
  const results = await Promise.all([f.client.open('Question'), f.client.open('Question')]);
  assert.deepEqual(results.map(result => result.status), ['submitted', 'existing']);
  assert.deepEqual(f.messages, ['Question']);
  assert.equal(f.attributes.has('data-initial-message'), false);
});

test('an unrelated query is not acknowledgement of automatic submission', async () => {
  const f = fixture({ legacy: true, acknowledge: false, timeoutMs: 20 });
  const opening = f.client.open('Question');
  await new Promise(resolve => setTimeout(resolve, 1));
  f.emit({ eventType: 'query:submitted', data: { query: 'Something else' } });
  await assert.rejects(opening, /timed out/);
});

test('existing conversation is preserved and history clear permits another legacy greeting', async () => {
  const f = fixture({ legacy: true });
  await f.client.open('First');
  assert.equal((await f.client.open('Second')).status, 'existing');
  f.emit({ eventType: 'history:cleared' });
  assert.equal((await f.client.open('Second')).status, 'submitted');
  assert.deepEqual(f.messages, ['First', 'Second']);
});

test('abort and disposal cancel SDK waits immediately, including before readiness', async () => {
  const f = fixture({ ready: new Promise(() => {}) });
  const abort = new AbortController();
  const opening = f.client.open('Question', abort.signal);
  await Promise.resolve();
  abort.abort();
  assert.equal((await opening).status, 'cancelled');
  assert.deepEqual(f.messages, []);
  const g = fixture({ acknowledge: false });
  const pending = g.client.open('Question');
  await Promise.resolve();
  g.client.dispose();
  assert.equal((await pending).status, 'cancelled');
});

test('timeouts clean attributes and do not replay uncertain automatic submissions', async () => {
  const f = fixture({ legacy: true, acknowledge: false, timeoutMs: 10 });
  await assert.rejects(f.client.open('Question'), /timed out/);
  assert.equal(f.attributes.has('data-initial-message'), false);
  await assert.rejects(f.client.open('Question'), /unknown outcome/);
  assert.deepEqual(f.messages, ['Question']);
});

test('SDK errors fail explicitly and a later manual opening remains possible', async () => {
  const f = fixture({ acknowledge: false });
  const pending = f.client.open('Question');
  await new Promise(resolve => setTimeout(resolve, 1));
  f.emit({ eventType: 'error:occurred' });
  await assert.rejects(pending, /SDK or service error/);
});

test('queued opening does not bootstrap after route eligibility changes', async () => {
  let resolve!: () => void;
  const f = fixture({ ready: new Promise<void>(done => { resolve = done; }) });
  const pending = f.client.open('Question');
  f.leavePage();
  resolve();
  assert.equal((await pending).status, 'cancelled');
  assert.deepEqual(f.messages, []);
});

test('a manual retry cannot use the legacy auto-submit path', async () => {
  const f = fixture({ legacy: true });
  assert.equal((await f.client.open('Question', undefined, false)).status, 'opened');
  assert.deepEqual(f.messages, [undefined]);
  assert.deepEqual(f.suggestions, ['Question']);
});

test('the acknowledgement deadline also covers a bootstrap promise that never resolves', async () => {
  const client = createConciergeClient({
    ready: Promise.resolve(), timeoutMs: 10,
    mount: { setAttribute() {}, removeAttribute() {} },
    bootstrap: () => new Promise(() => {}),
    canOpen: () => true,
  });
  await assert.rejects(client.open(), /timed out/);
});

test('cancellation invalidates queued questions before an immediate reopening', async () => {
  let resolveReady!: () => void;
  const f = fixture({ ready: new Promise<void>(resolve => { resolveReady = resolve; }) });
  const first = f.client.open('Old active question');
  await Promise.resolve();
  const queued = f.client.open('Old queued question');
  f.client.cancel();
  const fresh = f.client.open('Fresh question');
  resolveReady();
  assert.deepEqual((await Promise.all([first, queued, fresh])).map(result => result.status), ['cancelled', 'cancelled', 'opened']);
  assert.deepEqual(f.suggestions, ['Fresh question']);
});

test('manual contextual opening is permitted when proactive opening is ineligible', async () => {
  const questions: (string | undefined)[] = [];
  const client = createConciergeClient({
    ready: Promise.resolve(),
    mount: { setAttribute() {}, removeAttribute() {} },
    canOpen: (_question, automatic) => !automatic,
    bootstrap: (receive, question) => { questions.push(question); receive({ eventType: 'webclient:initialized' }); },
  });
  assert.equal((await client.open('Help with my booking', undefined, true)).status, 'cancelled');
  assert.equal((await client.open('Help with my booking', undefined, false)).status, 'opened');
  assert.deepEqual(questions, ['Help with my booking']);
});
