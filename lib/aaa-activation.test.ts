import assert from 'node:assert/strict';
import test from 'node:test';
import { travelJourney, travelProfile } from '../sites/wanderly/contract-examples.ts';
import type { StarterRequest } from '../aaa/contracts/types.ts';
import { acceptFrameActivationTrace, createActivationController, getActivationTraces, nudgeInvalidReason, type ActivationProvider, type ActivationSnapshot } from './aaa-activation.ts';
import { templateStarters } from './aaa-starters.ts';
import { createJourneyRuntime } from '../aaa/runtime.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '../aaa/profile/loader.ts';
import { defaultNudgeSettings } from '../aaa/nudge-settings.ts';
import { createNudgeSettingsClient } from './aaa-nudge-settings.ts';
import { fetchNudgeSettings } from './aaa-nudge-service.ts';
import { createConciergeClient, withConciergeSuggestion } from './brand-concierge-client.ts';
import { createVisitorBriefStore } from './aaa-visitor-brief.ts';
import { createConciergeJourneyContextReader } from './concierge-context-packager.ts';
import { createAmbientContextHook } from './ambient-context.ts';

function fixture() {
  let snapshot: ActivationSnapshot | undefined = {
    journey: structuredClone(travelJourney), profile: travelProfile, momentRuleId: 'compare-then-info', allowed: true, reasonCodes: [],
  };
  const provider: ActivationProvider = {
    read: () => snapshot,
    recordShown: () => ({ allowed: true, reasonCodes: [] }),
    recordDismissed() {},
  };
  let calls = 0;
  const fetchImpl: typeof fetch = async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body)) as StarterRequest;
    return Response.json(templateStarters(request, travelProfile, 'service.unavailable'));
  };
  return { provider, fetchImpl, calls: () => calls, get: () => snapshot!, set: (value: ActivationSnapshot | undefined) => { snapshot = value; } };
}

test('suppressed journeys never call generation', async () => {
  const f = fixture();
  f.set({ ...f.get(), allowed: false, reasonCodes: ['transaction.active'] });
  assert.equal(await createActivationController(f.provider, f.fetchImpl).prepare(), undefined);
  assert.equal(f.calls(), 0);
});

test('one in-flight generation per session, including different controllers', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const controller = createActivationController(f.provider, async (...args) => { await gate; return f.fetchImpl(...args); });
  const first = controller.prepare();
  assert.equal(await createActivationController(f.provider, f.fetchImpl).prepare(), undefined);
  release();
  assert.ok(await first);
  assert.equal(f.calls(), 1);
});

test('navigation during generation drops the result, never displaying it on the new page', async () => {
  const f = fixture();
  const controller = createActivationController(f.provider, async (...args) => {
    f.set({ ...f.get(), journey: { ...f.get().journey, page: { ...f.get().journey.page, pageRevision: 99 } } });
    return f.fetchImpl(...args);
  });
  assert.equal(await controller.prepare(), undefined);
});

test('rechecks suppression, profile, expiry and page freshness on visitor activation', async () => {
  const f = fixture();
  const controller = createActivationController(f.provider, f.fetchImpl);
  const nudge = (await controller.prepare())!;
  assert.ok(nudge);
  assert.equal(controller.isFresh(nudge), true);
  f.set({ ...f.get(), allowed: false, reasonCodes: ['exposure.dismissed'] });
  assert.equal(controller.isFresh(nudge), false);
  assert.equal(nudgeInvalidReason(nudge, f.get()), 'exposure.dismissed');
  f.set({ ...f.get(), allowed: true, journey: { ...f.get().journey, profileVersion: '2.0.0' } });
  assert.equal(nudgeInvalidReason(nudge, f.get()), 'starter.profile_changed');
  assert.equal(nudgeInvalidReason(nudge, undefined), 'activation.unavailable');
});

test('pre-send refresh applies newly activated suppression before opening chat', async () => {
  const f = fixture();
  const registry = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY });
  const published = registry.publish(travelProfile);
  assert.ok(published.ok);
  let time = 0;
  let activeSettings = defaultNudgeSettings(travelProfile.profileId);
  const settings = createNudgeSettingsClient({
    profileId: travelProfile.profileId, enabled: () => true, now: () => time,
    fetchImpl: async () => Response.json(await fetchNudgeSettings({
      endpoint: 'http://127.0.0.1:8000/aaa/starters', origin: 'http://localhost:3000',
      profileId: travelProfile.profileId, fetchImpl: async () => Response.json(activeSettings),
    })),
  });
  await settings.refresh();
  const runtime = createJourneyRuntime({
    availability: () => ({ consent: 'granted', active: published.active }),
    sessionId: () => travelJourney.sessionId,
    settings: settings.get,
    makeId: () => crypto.randomUUID(),
  });
  runtime.setPage('package-detail', '/package');
  f.provider.read = currentNudge => {
    const suppression = runtime.evaluate({ currentNudge });
    return { ...f.get(), allowed: suppression.allowed, reasonCodes: suppression.reasonCodes };
  };
  f.provider.refresh = settings.refresh;
  const controller = createActivationController(f.provider, f.fetchImpl);
  const nudge = (await controller.prepare())!;
  assert.ok(nudge);
  assert.equal(runtime.shown().allowed, true);
  assert.equal(controller.isFresh(nudge), true);
  time += 5_000;
  activeSettings = { ...activeSettings, maxNudgesPerSession: 0 };
  assert.equal(await controller.isFreshForSend(nudge), false);
  assert.equal(getActivationTraces(f.get().journey.sessionId).at(-1)?.trace.suppressionReasons[0], 'exposure.limit');
});

test('cancellation never retries the aborted request or publishes a fallback', async () => {
  const f = fixture();
  const controller = createActivationController(f.provider, async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = controller.prepare();
  controller.cancel();
  assert.equal(await pending, undefined);
  assert.equal(f.calls(), 0);
  assert.ok(await createActivationController(f.provider, f.fetchImpl).prepare());
});

test('service trace header survives preparation and links the client record without another request', async () => {
  const f = fixture();
  const traceId = 'a'.repeat(32);
  const controller = createActivationController(f.provider, async (...args) => {
    const response = await f.fetchImpl(...args);
    response.headers.set('X-AAA-Trace-Id', traceId);
    return response;
  });

  const prepared = await controller.prepare();
  assert.equal(prepared?.response.traceId, traceId);
  assert.equal(getActivationTraces(f.get().journey.sessionId).filter(entry => entry.phase === 'generation').at(-1)?.traceId, traceId);
  assert.equal(f.calls(), 1);
});

test('contextual results reach activation unchanged, and unavailable proxy falls back to legacy', async () => {
  const f = fixture();
  const paths: string[] = [];
  const controller = createActivationController(f.provider, async (url, init) => {
    paths.push(String(url));
    const request = JSON.parse(String(init?.body)) as StarterRequest;
    const response = templateStarters(request, travelProfile, 'service.unavailable');
    return Response.json({
      ...response, schemaVersion: 'aaa-contextual-starters-1',
      starterProvenance: response.result.starters.map(starter => ({ starterId: starter.starterId, source: 'generated' })),
      headline: { text: 'Ready to compare?', source: 'generated' }, intentSummary: 'Comparing destinations',
    });
  });
  const prepared = await controller.prepare();
  assert.equal(prepared?.response.headline?.text, 'Ready to compare?');
  assert.equal(prepared?.response.intentSummary, 'Comparing destinations');
  assert.deepEqual(paths, ['/api/aaa/contextual-starters']);
  const g = fixture();
  const legacyPaths: string[] = [];
  const fallback = createActivationController(g.provider, async (url, init) => {
    legacyPaths.push(String(url));
    return legacyPaths.length === 1 ? new Response(null, { status: 404 }) : g.fetchImpl(url, init);
  });
  assert.ok(await fallback.prepare());
  assert.deepEqual(legacyPaths, ['/api/aaa/contextual-starters', '/api/aaa/starters']);
});

test('v2 contextual brief and explanation survive activation', async () => {
  const f = fixture();
  const visitorBrief = { text: 'Comparing destinations.', slots: { stage: 'comparing', entityIds: [], priorities: [], openQuestions: [] }, source: 'rendered' };
  const why = { text: 'You compared destinations.', factIds: ['compared:bali+maldives'] };
  const controller = createActivationController(f.provider, async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as StarterRequest;
    const response = templateStarters(request, travelProfile, 'service.unavailable');
    return Response.json({
      ...response, schemaVersion: 'aaa-contextual-starters-2',
      starterProvenance: response.result.starters.map(starter => ({ starterId: starter.starterId, source: 'approved' })),
      visitorBrief, why, rationale: ['signal.back_and_forth'],
    });
  });
  const prepared = await controller.prepare();
  assert.deepEqual(prepared?.response.visitorBrief, visitorBrief);
  assert.deepEqual(prepared?.response.why, why);
  assert.deepEqual(prepared?.response.rationale, ['signal.back_and_forth']);
});

test('v3 written question and provenance survive activation unchanged', async () => {
  const f = fixture();
  const visitorBrief = { text: 'Comparing destinations.', slots: { stage: 'comparing', entityIds: [], priorities: [], openQuestions: [] }, source: 'rendered' };
  const why = { text: 'You compared destinations.', factIds: ['compared:bali+maldives'] };
  const question = 'How do Bali and Maldives compare for a quieter trip?';
  const controller = createActivationController(f.provider, async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as StarterRequest;
    const response = templateStarters(request, travelProfile, 'service.unavailable');
    response.result.starters[0].text = question;
    return Response.json({
      ...response, schemaVersion: 'aaa-contextual-starters-3',
      starterProvenance: response.result.starters.map(starter => ({ starterId: starter.starterId, source: 'written' })),
      visitorBrief, why, rationale: ['signal.back_and_forth'],
    });
  });
  const prepared = await controller.prepare();
  assert.equal(prepared?.response.result.starters[0].text, question);
  assert.equal(prepared?.response.starterProvenance?.[0].source, 'written');
  assert.deepEqual(prepared?.response.visitorBrief, visitorBrief);
  assert.deepEqual(prepared?.response.why, why);
  assert.deepEqual(prepared?.response.rationale, ['signal.back_and_forth']);
});

test('a fresh written activation passes exact starters to chat and a fresh brief to outgoing XDM', async () => {
  const f = fixture();
  const controller = createActivationController(f.provider, async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as StarterRequest;
    const response = templateStarters(request, travelProfile, 'service.unavailable');
    response.result.starters[0].text = 'Compare these two trips in my own terms?';
    return Response.json({
      ...response, schemaVersion: 'aaa-contextual-starters-3',
      starterProvenance: response.result.starters.map(starter => ({ starterId: starter.starterId, source: 'written' })),
      headline: { text: 'Choosing between trips?', source: 'generated' },
      visitorBrief: { text: 'Comparing destinations', slots: { stage: 'comparing', entityIds: [], priorities: [], openQuestions: [] }, source: 'rendered' },
    });
  });
  const nudge = (await controller.prepare())!;
  const store = createVisitorBriefStore();
  store.set('Comparing destinations', () => controller.isFresh(nudge, true, true));
  let welcome: object | undefined;
  const client = createConciergeClient({
    ready: Promise.resolve(), legacyAutoSubmit: false, timeoutMs: 100,
    mount: { setAttribute: () => assert.fail('must not auto-submit'), removeAttribute() {} },
    canOpen: () => true,
    bootstrap: (event, question, examples, exact) => {
      welcome = withConciergeSuggestion({}, question, examples, exact);
      event({ eventType: 'webclient:initialized' });
    },
  });
  const starters = nudge.response.result.starters.map(starter => starter.text);
  assert.equal((await client.open(starters[0], undefined, false, starters, () => controller.isFresh(nudge), true)).status, 'opened');
  assert.deepEqual(welcome, { arrays: { 'welcome.examples': starters.map(text => ({ text })) } });
  const readContext = createConciergeJourneyContextReader({
    getProfile: () => f.get().profile, getCanonicalJourney: () => f.get().journey,
    getCurrentPage: () => f.get().journey.page, getVisitorBrief: () => store.get(),
  });
  const hook = createAmbientContextHook(() => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }), undefined, undefined, () => true, readContext);
  const outgoing: { xdm?: Record<string, unknown> } = {};
  hook(outgoing);
  assert.match(JSON.stringify(outgoing.xdm), /Comparing destinations/);
  f.set({ ...f.get(), journey: { ...f.get().journey, page: { ...f.get().journey.page, pageRevision: 99 } } });
  const stale: { xdm?: Record<string, unknown> } = {};
  hook(stale);
  assert.doesNotMatch(JSON.stringify(stale.xdm), /Comparing destinations/);
});

test('frame trace ingestion retains only bounded diagnostic codes', () => {
  const sessionId = 'frame-trace-test';
  acceptFrameActivationTrace({ at: 1, sessionId, phase: 'generation', trace: { reasonCodes: ['validator.passed', 'private page text'] }, traceId: 'not-an-id' });
  const trace = getActivationTraces(sessionId).at(-1)!;
  assert.deepEqual(trace.trace.reasonCodes, ['validator.passed']);
  assert.equal(trace.traceId, undefined);
  acceptFrameActivationTrace({ at: 1, sessionId: 'invalid session!', phase: 'generation', trace: {} });
  assert.equal(getActivationTraces('invalid session!').length, 0);
  acceptFrameActivationTrace({ at: Number.MAX_VALUE, sessionId: 'invalid-date', phase: 'generation', trace: {} });
  assert.equal(getActivationTraces('invalid-date').length, 0);
});
