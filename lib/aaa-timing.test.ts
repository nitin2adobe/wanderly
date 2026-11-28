import assert from 'node:assert/strict';
import test from 'node:test';
import { travelJourney, travelProfile } from '../sites/wanderly/contract-examples.ts';
import type { ActivationProvider, ActivationSnapshot } from './aaa-activation.ts';
import { createTimingController, type TimingEntry } from './aaa-timing.ts';
import type { DecisionPoint } from './aaa-decision-points.ts';
import { validateContract } from '../aaa/contracts/validate.ts';
import reviewedProfile from '../sites/wanderly/profile.json' with { type: 'json' };
import { handleMomentRequest } from './aaa-moment-route.ts';

function fixture() {
  let snapshot: ActivationSnapshot | undefined = {
    journey: { ...structuredClone(travelJourney), sessionId: crypto.randomUUID() },
    profile: travelProfile, momentRuleId: 'compare-then-info', allowed: true, reasonCodes: [],
  };
  const provider: ActivationProvider = { read: () => snapshot, recordShown: () => ({ allowed: true, reasonCodes: [] }), recordDismissed() {} };
  let calls = 0;
  const response: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    return Response.json({
      schemaVersion: 'aaa-moment-result-1', requestId: body.request.requestId, sessionId: body.request.journey.sessionId,
      page: body.request.journey.page, decisionPoint: body.decisionPoint, decision: 'assist', source: 'agent',
      judgments: { welcomeNow: 'yes', makingProgress: 'no', stuck: 'yes' },
      modelRecommendation: 'assist', confidence: 'medium', reasonCodes: ['signal.compared'],
      assertiveness: 'default', expiresAt: new Date(Date.now() + 30000).toISOString(), traceId: 'a'.repeat(32),
    });
  };
  const point = (sequence: number): DecisionPoint => ({
    kind: 'page_settled', sequence, pageSequence: sequence, pageInstanceId: snapshot!.journey.page.pageInstanceId,
  });
  return { provider, response, point, calls: () => calls, get: () => snapshot!, set: (value: ActivationSnapshot | undefined) => { snapshot = value; } };
}

test('safeguards block before any timing request', async () => {
  const f = fixture();
  f.set({ ...f.get(), allowed: false, reasonCodes: ['transaction.active'] });
  const controller = createTimingController(f.provider, f.response);
  const entry = await controller.decide(f.point(1), 0);
  assert.equal(entry?.outcome, 'blocked');
  assert.equal(entry?.rulesWouldAssist, false);
  assert.equal(f.calls(), 0);
});

test('a stale response is discarded and page revisions on the same page remain usable', async () => {
  const f = fixture();
  const original = f.get();
  const controller = createTimingController(f.provider, async (...args) => {
    const response = await f.response(...args);
    f.set({ ...f.get(), journey: { ...f.get().journey, page: { ...f.get().journey.page, pageRevision: 99 } } });
    return response;
  });
  assert.equal((await controller.decide(f.point(1), 0))?.outcome, 'assist');
  f.set(original);
  const stale = createTimingController(f.provider, async (...args) => {
    const response = await f.response(...args);
    f.set({ ...f.get(), journey: { ...f.get().journey, page: { ...f.get().journey.page, pageInstanceId: 'new-page' } } });
    return response;
  });
  assert.equal(await stale.decide(f.point(2), 0), undefined);
});

test('two failures or unavailable switch future points to rules; rate limiting does not count', async () => {
  const f = fixture();
  let status = 502;
  const controller = createTimingController(f.provider, async () => Response.json({ reasonCodes: ['timing.unavailable'] }, { status }));
  assert.equal((await controller.decide(f.point(1), 0))?.source, 'agent.failed');
  status = 429;
  assert.equal((await controller.decide(f.point(2), 0))?.source, 'agent.failed');
  assert.equal(controller.mode(f.get().journey.sessionId), 'agent');
  status = 502;
  assert.equal((await controller.decide(f.point(3), 0))?.source, 'agent.failed');
  assert.equal((await controller.decide(f.point(4), 0))?.source, 'rules.fallback');
  const other = fixture();
  const unavailable = createTimingController(other.provider, async () => Response.json({ reasonCodes: ['timing.unavailable'] }, { status: 503 }));
  await unavailable.decide(other.point(1), 0);
  assert.equal(unavailable.mode(other.get().journey.sessionId), 'rules.fallback');
});

test('only the newest queued point runs and no queued request follows an assist', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const controller = createTimingController(f.provider, async (...args) => { await gate; return f.response(...args); });
  const first = controller.decide(f.point(1), 0);
  const second = controller.decide(f.point(2), 0);
  const third = controller.decide(f.point(3), 0);
  release();
  const results: (TimingEntry | undefined)[] = await Promise.all([first, second, third]);
  assert.equal(results[0]?.outcome, 'assist');
  assert.equal(results[1], undefined);
  assert.equal(results[2], undefined);
  assert.equal(f.calls(), 1);
});

test('duplicate points are never resent and a late safeguard cancels an assist', async () => {
  const f = fixture();
  const controller = createTimingController(f.provider, async (...args) => {
    const response = await f.response(...args);
    f.set({ ...f.get(), allowed: false, reasonCodes: ['form.focused'] });
    return response;
  });
  assert.equal((await controller.decide(f.point(1), 0))?.outcome, 'blocked');
  assert.equal(await controller.decide(f.point(1), 0), undefined);
  assert.equal(f.calls(), 1);
});

test('a valid agent.failed response counts towards session fallback', async () => {
  const f = fixture();
  const controller = createTimingController(f.provider, async (...args) => {
    const response = await f.response(...args);
    const { judgments, confidence, modelRecommendation, ...body } = await response.json();
    return Response.json({ ...body, source: 'agent.failed', decision: 'silent', reasonCodes: ['timing.model_failed'] });
  });
  await controller.decide(f.point(1), 0);
  await controller.decide(f.point(2), 0);
  assert.equal(controller.mode(f.get().journey.sessionId), 'rules.fallback');
});

test('controllers share a session slot and run only the newest queued point after silence', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetchSilent: typeof fetch = async (...args) => {
    await gate;
    const body = await (await f.response(...args)).json();
    return Response.json({ ...body, decision: 'silent' });
  };
  const firstController = createTimingController(f.provider, fetchSilent);
  const otherController = createTimingController(f.provider, fetchSilent);
  const first = firstController.decide(f.point(1), 0);
  const replaced = otherController.decide(f.point(2), 0);
  const latest = otherController.decide(f.point(3), 0);
  release();
  assert.equal((await first)?.outcome, 'silent');
  assert.equal(await replaced, undefined);
  assert.equal((await latest)?.point.sequence, 3);
  assert.equal(f.calls(), 2);
});

test('controller and proxy exchange a validated decision without bypassing safeguards', async () => {
  const f = fixture();
  const profile = validateContract('SiteProfile', reviewedProfile);
  assert.ok(profile.valid);
  const journey = structuredClone(f.get().journey);
  journey.profileId = profile.value.profileId;
  journey.profileVersion = profile.value.profileVersion;
  for (const signal of journey.raw.signals) {
    signal.profileId = journey.profileId;
    signal.profileVersion = journey.profileVersion;
  }
  f.set({ ...f.get(), journey, profile: profile.value });
  const oldFetch = globalThis.fetch;
  const oldEndpoint = process.env.AAA_STARTER_SERVICE_URL;
  let upstreamCalls = 0;
  try {
    process.env.AAA_STARTER_SERVICE_URL = 'http://127.0.0.1:12345/aaa/starters';
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:12345/aaa/moment');
      upstreamCalls++;
      const request = JSON.parse(String(init?.body));
      return Response.json({
        schemaVersion: 'aaa-moment-result-1', requestId: request.request.requestId,
        sessionId: request.request.journey.sessionId, page: request.request.journey.page,
        decisionPoint: request.decisionPoint, decision: 'assist', source: 'agent',
        judgments: { welcomeNow: 'yes', makingProgress: 'no', stuck: 'yes' },
        modelRecommendation: 'assist', confidence: 'medium', reasonCodes: ['signal.compared'],
        assertiveness: 'default', expiresAt: new Date(Date.now() + 30000).toISOString(), traceId: 'a'.repeat(32),
      });
    };
    const controller = createTimingController(f.provider, async (_input, init) =>
      handleMomentRequest(new Request('http://localhost/api/aaa/moment', init)));
    assert.equal((await controller.decide(f.point(1), 0))?.outcome, 'assist');
    f.set({ ...f.get(), allowed: false, reasonCodes: ['transaction.active'] });
    assert.equal((await controller.decide(f.point(2), 0))?.outcome, 'blocked');
    assert.equal(upstreamCalls, 1);
    const unavailable = fixture();
    const unavailableJourney = structuredClone(journey);
    unavailableJourney.sessionId = unavailable.get().journey.sessionId;
    for (const signal of unavailableJourney.raw.signals) signal.sessionId = unavailableJourney.sessionId;
    unavailable.set({ ...unavailable.get(), journey: unavailableJourney, profile: profile.value });
    globalThis.fetch = async () => {
      upstreamCalls++;
      return Response.json({ code: 'timing.unavailable', correlationId: 'correlation-test' }, { status: 503 });
    };
    const fallback = createTimingController(unavailable.provider, async (_input, init) =>
      handleMomentRequest(new Request('http://localhost/api/aaa/moment', init)));
    assert.equal((await fallback.decide(unavailable.point(1), 0))?.source, 'agent.failed');
    assert.equal(fallback.mode(unavailableJourney.sessionId), 'rules.fallback');
    assert.equal((await fallback.decide(unavailable.point(2), 0))?.source, 'rules.fallback');
    assert.equal(upstreamCalls, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldEndpoint === undefined) delete process.env.AAA_STARTER_SERVICE_URL;
    else process.env.AAA_STARTER_SERVICE_URL = oldEndpoint;
  }
});
