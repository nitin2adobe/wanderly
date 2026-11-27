import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchExplain } from './aaa-explain-service.ts';

test('explain proxy validates trace IDs and forwards only the trusted origin', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), `http://localhost:8000/aaa/traces/${'a'.repeat(32)}/explain`);
    assert.equal(new Headers(init?.headers).get('origin'), 'http://localhost:3000');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ schemaVersion: 'aaa-explain-1' });
  };
  assert.equal((await fetchExplain('../bad', { endpoint: 'http://localhost:8000/aaa/starters', fetchImpl })).status, 400);
  assert.equal(calls, 0);
  const result = await fetchExplain('a'.repeat(32), { endpoint: 'http://localhost:8000/aaa/starters', origin: 'http://localhost:3000', fetchImpl });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { schemaVersion: 'aaa-explain-1' });
});

test('explain proxy preserves missing trace status without forwarding error bodies', async () => {
  const response = await fetchExplain('b'.repeat(32), {
    endpoint: 'http://localhost:8000/aaa/starters',
    fetchImpl: async () => new Response('private failure details', { status: 404 }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'explain_unavailable' });
});
