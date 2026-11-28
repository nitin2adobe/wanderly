import assert from 'node:assert/strict';
import test from 'node:test';
import requestExample from '../aaa/contracts/timing/moment-request-1.example.json' with { type: 'json' };
import resultExample from '../aaa/contracts/timing/moment-result-1.example.json' with { type: 'json' };
import profile from '../sites/wanderly/profile.json' with { type: 'json' };
import { handleMomentRequest } from './aaa-moment-route.ts';

const requestBody = () => {
  const body = structuredClone(requestExample);
  body.request.journey.profileId = profile.profileId;
  body.request.journey.profileVersion = profile.profileVersion;
  for (const signal of body.request.journey.raw.signals) {
    signal.profileId = profile.profileId;
    signal.profileVersion = profile.profileVersion;
  }
  return body;
};
const request = (body: unknown) => new Request('http://localhost/api/aaa/moment', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('timing proxy validates both boundaries and handles an unavailable service', async () => {
  const previousEndpoint = process.env.AAA_STARTER_SERVICE_URL;
  const previousFetch = globalThis.fetch;
  try {
    delete process.env.AAA_STARTER_SERVICE_URL;
    let response = await handleMomentRequest(request(requestBody()));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { reasonCodes: ['timing.unavailable'] });
    response = await handleMomentRequest(request({ ...requestBody(), extra: true }));
    assert.equal(response.status, 400);
    const wrongProfile = requestBody();
    wrongProfile.request.journey.profileVersion = '99.0.0';
    response = await handleMomentRequest(request(wrongProfile));
    assert.equal(response.status, 503);

    process.env.AAA_STARTER_SERVICE_URL = 'http://127.0.0.1:12345/aaa/starters';
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:12345/aaa/moment');
      assert.equal(new Headers(init?.headers).get('origin'), 'http://localhost:3000');
      return Response.json(resultExample, { headers: { 'X-AAA-Trace-Id': resultExample.traceId } });
    };
    response = await handleMomentRequest(request(requestBody()));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-aaa-trace-id'), resultExample.traceId);
    globalThis.fetch = async () => Response.json({ ...resultExample, text: 'not permitted' });
    assert.equal((await handleMomentRequest(request(requestBody()))).status, 502);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    globalThis.fetch = async () => { await gate; return Response.json(resultExample); };
    const pending = handleMomentRequest(request(requestBody()));
    await new Promise(resolve => setTimeout(resolve, 0));
    response = await handleMomentRequest(request(requestBody()));
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { reasonCodes: ['timing.in_flight'] });
    release();
    assert.equal((await pending).status, 200);
  } finally {
    if (previousEndpoint === undefined) delete process.env.AAA_STARTER_SERVICE_URL;
    else process.env.AAA_STARTER_SERVICE_URL = previousEndpoint;
    globalThis.fetch = previousFetch;
  }
});
