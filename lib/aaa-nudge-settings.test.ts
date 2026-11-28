import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultNudgeSettings } from '../aaa/nudge-settings.ts';
import { createNudgeSettingsClient } from './aaa-nudge-settings.ts';
import { fetchNudgeSettings } from './aaa-nudge-service.ts';

const defaults = defaultNudgeSettings('wanderly');
const configured = { ...defaults, minIntervalMs: 120_000, maxNudgesPerSession: 4, inactivityTimeoutMs: 600_000, suppressAfterNotNow: false };

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

test('settings client retains valid settings across refresh failure and tab reload', async () => {
  const storage = memoryStorage();
  let time = 0;
  let calls = 0;
  let changed = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return calls === 1 ? Response.json(configured) : new Response(null, { status: 503 });
  };
  const options = { profileId: 'wanderly', enabled: () => true, storage, fetchImpl, now: () => time, changed: () => { changed++; } };
  const client = createNudgeSettingsClient(options);
  assert.deepEqual(client.get(), defaults);
  await client.refresh();
  assert.deepEqual(client.get(), configured);
  await client.refresh();
  assert.equal(calls, 1);
  time += 5_000;
  await client.refresh();
  assert.deepEqual(client.get(), configured);
  const reloaded = createNudgeSettingsClient(options);
  reloaded.initialize();
  assert.deepEqual(reloaded.get(), configured);
  assert.equal(changed, 2);
});

test('settings reject other profiles, invalid values and unavailable first fetch', async () => {
  for (const payload of [
    { ...configured, profileId: 'another-site' },
    { ...configured, inactivityTimeoutMs: 1_800_001 },
    { ...configured, maxNudgesPerSession: -1 },
    { ...configured, suppressWhileChatOpen: 'false' },
  ]) {
    const client = createNudgeSettingsClient({ profileId: 'wanderly', enabled: () => true, fetchImpl: async () => Response.json(payload) });
    await client.refresh();
    assert.deepEqual(client.get(), defaults);
  }
  const unavailable = createNudgeSettingsClient({ profileId: 'wanderly', enabled: () => true, fetchImpl: async () => new Response(null, { status: 503 }) });
  await unavailable.refresh();
  assert.deepEqual(unavailable.get(), defaults);
});

test('no settings request or persistence before consent; revoked consent discards in-flight results', async () => {
  let enabled = false;
  let calls = 0;
  let resolve!: (response: Response) => void;
  const storage = memoryStorage();
  const client = createNudgeSettingsClient({
    profileId: 'wanderly', enabled: () => enabled, storage,
    fetchImpl: async () => { calls++; return new Promise<Response>(done => { resolve = done; }); },
  });
  client.initialize();
  await client.refresh();
  assert.equal(calls, 0);
  enabled = true;
  const request = client.refresh();
  enabled = false;
  client.reset();
  resolve(Response.json(configured));
  await request;
  assert.deepEqual(client.get(), defaults);
  enabled = true;
  const reloaded = createNudgeSettingsClient({ profileId: 'wanderly', enabled: () => enabled, storage });
  reloaded.initialize();
  assert.deepEqual(reloaded.get(), defaults);
});

test('service request is pinned to configured origin and profile; wrong-profile responses fail', async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:8000/aaa/nudge-settings?profileId=wanderly');
    assert.deepEqual(init?.headers, { Origin: 'https://site.example' });
    assert.equal(init?.cache, 'no-store');
    return Response.json(configured);
  };
  assert.deepEqual(await fetchNudgeSettings({ endpoint: 'http://127.0.0.1:8000/aaa/starters', origin: 'https://site.example', profileId: 'wanderly', fetchImpl }), configured);
  await assert.rejects(fetchNudgeSettings({
    endpoint: 'http://127.0.0.1:8000/aaa/starters', origin: 'https://site.example', profileId: 'wanderly',
    fetchImpl: async () => Response.json({ ...configured, profileId: 'another-site' }),
  }), /settings.invalid/);
});
