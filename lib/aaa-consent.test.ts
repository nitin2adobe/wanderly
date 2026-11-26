import assert from 'node:assert/strict';
import test from 'node:test';
import { CONSENT_STORAGE_KEY, createDemoConsentAuthority, getConsentAuthority, hostConsentAuthority, startConsentGatedWebSdk, type ConsentAuthority } from './aaa-consent.ts';
import { createJourneyStore } from './journey-store.ts';
import { createAmbientContextHook } from './ambient-context.ts';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

function fakeAlloy() {
  const calls: [string, unknown][] = [];
  return { calls, alloy: async (command: string, options?: unknown) => { calls.push([command, options]); } };
}

const consentValue = (call: [string, unknown]) => (call[1] as { consent: { value: { general: string } }[] }).consent[0].value.general;

async function startWith(authority: ConsentAuthority) {
  const { calls, alloy } = fakeAlloy();
  const sdk = startConsentGatedWebSdk({ alloy, hostOwned: false, authority, configuration: { datastreamId: 'demo' } });
  await sdk.settled();
  return { calls, sdk };
}

test('before consent: Web SDK is configured pending, with no consent-in and no event, and ready does not wait', async () => {
  const { calls } = await startWith(createDemoConsentAuthority(memoryStore()));
  assert.deepEqual(calls.map(([command]) => command), ['configure']);
  assert.equal((calls[0][1] as { defaultConsent: string }).defaultConsent, 'pending');
});

test('accept: configure pending, then setConsent(in), then sendEvent', async () => {
  const authority = createDemoConsentAuthority(memoryStore());
  const { calls, sdk } = await startWith(authority);
  authority.decide('granted');
  await sdk.settled();
  assert.deepEqual(calls.map(([command]) => command), ['configure', 'setConsent', 'sendEvent']);
  assert.equal(consentValue(calls[1]), 'in');
});

test('deny: consent is set out and no event is sent', async () => {
  const authority = createDemoConsentAuthority(memoryStore());
  const { calls, sdk } = await startWith(authority);
  authority.decide('denied');
  await sdk.settled();
  assert.deepEqual(calls.map(([command]) => command), ['configure', 'setConsent']);
  assert.equal(consentValue(calls[1]), 'out');
});

test('reload: a remembered decision is applied immediately after configure', async () => {
  const granted = await startWith(createDemoConsentAuthority(memoryStore({ [CONSENT_STORAGE_KEY]: 'granted' })));
  assert.deepEqual(granted.calls.map(([command]) => command), ['configure', 'setConsent', 'sendEvent']);
  const denied = await startWith(createDemoConsentAuthority(memoryStore({ [CONSENT_STORAGE_KEY]: 'denied' })));
  assert.deepEqual(denied.calls.map(([command]) => command), ['configure', 'setConsent']);
  assert.equal(consentValue(denied.calls[1]), 'out');
});

test('a host-owned Web SDK is never configured, consented or sent to', async () => {
  const { calls, alloy } = fakeAlloy();
  const sdk = startConsentGatedWebSdk({ alloy, hostOwned: true, authority: createDemoConsentAuthority(memoryStore({ [CONSENT_STORAGE_KEY]: 'granted' })), configuration: {} });
  await sdk.settled();
  assert.deepEqual(calls, []);
});

test('the host CMP is authoritative and fails closed on unknown or throwing values', () => {
  let state: unknown = 'granted';
  const authority = hostConsentAuthority({ get: () => state as never, subscribe: () => () => {} });
  assert.equal(authority.kind, 'host-cmp');
  assert.equal(authority.get(), 'granted');
  state = 'yes';
  assert.equal(authority.get(), 'pending');
  assert.equal(hostConsentAuthority({ get: () => { throw new Error('cmp'); }, subscribe: () => () => {} }).get(), 'pending');
});

test('a malformed host adapter cannot fall back to a previously granted demo banner', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    aaaConsentAuthority: {}, localStorage: memoryStore({ [CONSENT_STORAGE_KEY]: 'granted' }),
  } });
  try {
    assert.equal(getConsentAuthority().kind, 'host-cmp');
    assert.equal(getConsentAuthority().get(), 'pending');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('a failed host subscription fails closed', () => {
  const authority = hostConsentAuthority({ get: () => 'granted', subscribe: () => { throw new Error('unavailable'); } });
  const original = console.error;
  console.error = () => {};
  try { authority.subscribe(() => {}); } finally { console.error = original; }
  assert.equal(authority.get(), 'pending');
});

test('a grant revoked before the queued SDK call does not send consent-in', async () => {
  const authority = createDemoConsentAuthority(memoryStore());
  const { calls, sdk } = await startWith(authority);
  authority.decide('granted');
  authority.decide('denied');
  await sdk.settled();
  assert.deepEqual(calls.map(([command]) => command), ['configure', 'setConsent']);
  assert.equal(consentValue(calls[1]), 'out');
});

test('journey store neither reads nor writes before consent, and records after accept', () => {
  let granted = false;
  const session = memoryStore();
  let n = 0;
  const store = createJourneyStore({ session, isGranted: () => granted, makeId: prefix => `${prefix}${++n}` });
  assert.equal(store.track('PAGE_VIEW', '/destinations'), undefined);
  assert.deepEqual(store.getEvents(), []);
  assert.equal(store.getSessionId(), '');
  assert.equal(session.data.size, 0);
  granted = true;
  const event = store.track('PAGE_VIEW', '/destinations');
  assert.equal(event?.page, '/destinations');
  assert.equal(store.getEvents().filter(item => item.sessionId === event?.sessionId).length, 1);
  granted = false;
  store.purge();
  assert.equal(session.data.size, 0);
  assert.equal(store.track('PAGE_VIEW', '/'), undefined);
  assert.equal(session.data.size, 0);
});

test('a session idle for 30 minutes is forgotten and a new one starts', () => {
  let clock = Date.parse('2026-11-26T10:00:00Z');
  let n = 0;
  const store = createJourneyStore({ session: memoryStore(), isGranted: () => true, now: () => clock, makeId: prefix => `${prefix}${++n}` });
  const first = store.track('PAGE_VIEW', '/')!;
  clock += 29 * 60_000;
  assert.equal(store.getSessionId(), first.sessionId);
  assert.equal(store.getEvents().length, 1);
  clock += 30 * 60_000;
  assert.deepEqual(store.getEvents(), []);
  assert.notEqual(store.getSessionId(), first.sessionId);
});

test('an otherwise empty session also expires after 30 minutes of inactivity', () => {
  let clock = Date.parse('2026-11-26T10:00:00Z');
  let n = 0;
  const store = createJourneyStore({ session: memoryStore(), isGranted: () => true, now: () => clock, makeId: prefix => `${prefix}${++n}` });
  const first = store.getSessionId();
  clock += 30 * 60_000;
  assert.notEqual(store.getSessionId(), first);
});

test('ambient page context is not attached unless consent is granted', () => {
  let granted = false;
  const hook = createAmbientContextHook(() => ({ url: 'https://demo.test/booking?email=x', path: '/booking', title: 'A' }), undefined, () => new Date(0), () => granted);
  const before: { xdm?: Record<string, unknown> } = {};
  assert.equal(hook(before), true);
  assert.equal(before.xdm, undefined);
  granted = true;
  const after: { xdm?: Record<string, unknown> } = {};
  hook(after);
  assert.equal((after.xdm?._adaptiveAssistance as { pageContext: { url: string } }).pageContext.url, 'https://demo.test/booking');
});

test('legacy persisted events are minimized before being returned or retained', () => {
  const session = memoryStore({ 'wanderly.events.v1': JSON.stringify([{
    id: 'legacy', sessionId: 'old', timestamp: new Date().toISOString(), eventType: 'PAGE_VIEW',
    page: '/booking?email=visitor%40example.com', metadata: { email: 'visitor@example.com' },
  }]) });
  const store = createJourneyStore({ session, isGranted: () => true, makeId: () => 'id' });
  assert.equal(store.getEvents()[0].page, '/booking');
  assert.ok(!JSON.stringify(store.getEvents()).includes('visitor'));
  assert.ok(!session.data.get('wanderly.events.v1')?.includes('visitor'));
});

const tab = (session = memoryStore(), legacy?: ReturnType<typeof memoryStore>, clock = () => Date.parse('2026-11-26T10:00:00Z'), granted = () => true) => {
  let n = 0;
  return { session, store: createJourneyStore({ session, legacy, isGranted: granted, now: clock, makeId: prefix => `${prefix}${++n}_${Math.random().toString(36).slice(2, 6)}` }) };
};

test('separate tabs keep separate journeys that never mix', () => {
  const shared = memoryStore();
  const a = tab(memoryStore(), shared);
  const b = tab(memoryStore(), shared);
  a.store.track('DESTINATION_VIEW', '/destinations/kyoto', 'kyoto');
  b.store.track('PACKAGE_VIEW', '/packages/lisbon-weekend', 'lisbon-weekend');
  assert.notEqual(a.store.getSessionId(), b.store.getSessionId());
  assert.deepEqual(a.store.getEvents().map(e => e.eventType), ['DESTINATION_VIEW']);
  assert.deepEqual(b.store.getEvents().map(e => e.eventType), ['PACKAGE_VIEW']);
  assert.equal(shared.data.size, 0);
  a.store.purge();
  assert.deepEqual(a.store.getEvents(), []);
  assert.equal(b.store.getEvents().length, 1);
});

test('a reload within 30 minutes resumes the same tab session and its events', () => {
  let clock = Date.parse('2026-11-26T10:00:00Z');
  const session = memoryStore();
  const first = tab(session, undefined, () => clock).store;
  const event = first.track('PAGE_VIEW', '/destinations')!;
  clock += 29 * 60_000;
  const reloaded = tab(session, undefined, () => clock).store;
  assert.equal(reloaded.getSessionId(), event.sessionId);
  assert.equal(reloaded.getEvents().length, 1);
});

test('the expiry sweep deletes an idle tab session even without consent, and keeps an active one', () => {
  let clock = Date.parse('2026-11-26T10:00:00Z');
  let granted = true;
  const { session, store } = tab(memoryStore(), undefined, () => clock, () => granted);
  store.track('PAGE_VIEW', '/destinations');
  clock += 10 * 60_000;
  assert.equal(store.sweep(), false);
  assert.ok(session.data.has('wanderly.events.v1'));
  granted = false;
  clock += 20 * 60_000;
  assert.equal(store.sweep(), true);
  assert.equal(session.data.size, 0);
});

test('the expiry sweep does not read or rewrite journey events without consent', () => {
  let clock = Date.parse('2026-11-26T10:00:00Z');
  let granted = true;
  const backing = memoryStore();
  const operations: string[] = [];
  const session = {
    getItem: (key: string) => { operations.push(`get:${key}`); return backing.getItem(key); },
    setItem: (key: string, value: string) => { operations.push(`set:${key}`); backing.setItem(key, value); },
    removeItem: (key: string) => { operations.push(`remove:${key}`); backing.removeItem(key); },
  };
  const store = createJourneyStore({ session, isGranted: () => granted, now: () => clock, makeId: prefix => `${prefix}_id` });
  store.track('PAGE_VIEW', '/destinations');
  granted = false;
  operations.length = 0;
  clock += 10 * 60_000;
  assert.equal(store.sweep(), false);
  assert.ok(!operations.includes('get:wanderly.events.v1'));
  assert.ok(!operations.some(operation => operation.startsWith('set:')));
  clock += 20 * 60_000;
  operations.length = 0;
  assert.equal(store.sweep(), true);
  assert.ok(!operations.includes('get:wanderly.events.v1'));
  assert.ok(!operations.some(operation => operation.startsWith('set:')));
  assert.equal(backing.data.size, 0);
});

test('legacy shared journey storage from earlier builds is removed', () => {
  const legacy = memoryStore({ 'wanderly.events.v1': '[]', 'aaa.consent.v1': 'granted' });
  tab(memoryStore(), legacy);
  assert.equal(legacy.data.has('wanderly.events.v1'), false);
  assert.equal(legacy.data.get('aaa.consent.v1'), 'granted');
});

test('a decision made in another tab reaches this tab so it can purge its own journey', () => {
  const shared = memoryStore({ [CONSENT_STORAGE_KEY]: 'granted' });
  const thisTab = createDemoConsentAuthority(shared);
  const otherTab = createDemoConsentAuthority(shared);
  const seen: string[] = [];
  thisTab.subscribe(state => seen.push(state));
  otherTab.decide('denied');
  assert.deepEqual(seen, []);
  thisTab.sync();
  assert.deepEqual(seen, ['denied']);
  assert.equal(thisTab.get(), 'denied');
});

test('the inspector sees only its own tab\'s consented journey, and nothing after denial', () => {
  let granted = true;
  const shared = memoryStore();
  const site = tab(memoryStore(), shared, undefined, () => granted);
  const other = tab(memoryStore(), shared, undefined, () => granted);
  site.store.track('DESTINATION_VIEW', '/destinations/kyoto', 'kyoto');
  other.store.track('PACKAGE_VIEW', '/packages/lisbon-weekend', 'lisbon-weekend');
  const view = site.store.currentJourney();
  assert.deepEqual(view.events.map(e => e.eventType), ['DESTINATION_VIEW']);
  assert.ok(view.events.every(e => e.sessionId === view.sessionId));
  granted = false;
  site.store.purge();
  assert.deepEqual(site.store.currentJourney(), { sessionId: '', events: [] });
  assert.equal(site.session.data.size, 0);
  assert.equal(shared.data.size, 0);
});
