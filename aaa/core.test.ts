import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultNudgeSettings } from './nudge-settings.ts';
import { createSignalCollector } from './collector.ts';
import { connectDataLayer, readAttributeSignal, type DataLayer } from './browser-inputs.ts';
import type { CanonicalSignal, SiteProfile } from './contracts/types.ts';
import { validateContract } from './contracts/validate.ts';
import { deriveJourney, matchMoment } from './journey.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from './profile/loader.ts';
import { createJourneyRuntime } from './runtime.ts';
import { emptyExposure, evaluateSuppression } from './suppression.ts';
import profileJson from '../sites/wanderly/profile.json' with { type: 'json' };
import { retailProfile } from '../sites/retail/contract-examples.ts';

function activeProfile(input: unknown = profileJson) {
  const result = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(input);
  assert.ok(result.ok);
  return result.active;
}
const context = { sessionId: 'session-1', pageInstanceId: 'page-1', pageRevision: 1, pageType: 'package-detail', locale: 'en-US' };
const epoch = Date.parse('2026-11-26T00:00:00Z');
function collectorSetup(profile = activeProfile().profile) {
  let id = 0;
  const diagnostics: unknown[] = [];
  const collector = createSignalCollector({ profile, context: () => context, enabled: () => true, now: () => epoch, makeId: () => `signal-${++id}`, diagnostic: value => diagnostics.push(value) });
  return { collector, diagnostics };
}
function fixtureSignals() {
  const { collector } = collectorSetup();
  collector.track('page.viewed');
  collector.track('entities.compared', { entityIds: ['island-rhythm', 'bali-slow-living'], entityType: 'package' });
  collector.track('info.sought', { topicId: 'sample-price' });
  return collector;
}
test('all three ingress paths produce frozen-contract-valid signals with host metadata', () => {
  const { collector } = collectorSetup();
  const direct = collector.track('destination.viewed', { entityIds: ['japan'], sessionId: 'forged', seq: 999, locale: 'xx' });
  assert.equal(direct?.sessionId, context.sessionId);
  assert.equal(direct?.seq, 1);
  const attributes = new Map([['data-aaa-event', 'facet.selected'], ['data-aaa-facet-id', 'pace'], ['data-aaa-value-ids', 'relaxed']]);
  const input = readAttributeSignal({ getAttribute: name => attributes.get(name) ?? null });
  assert.ok(input);
  collector.ingest('data-attribute', input.name, input.payload);
  const layer: DataLayer = [];
  const disconnect = connectDataLayer(layer, collector);
  layer.push({ event: 'compare.view', eventInfo: { ids: ['island-rhythm', 'bali-slow-living'], type: 'package' } });
  disconnect();
  assert.equal(collector.signals().length, 3);
  collector.signals().forEach((signal, index) => {
    assert.equal(validateContract('CanonicalSignal', signal).valid, true);
    assert.equal(signal.seq, index + 1);
    assert.equal(signal.schemaVersion, '1.0.0');
    assert.equal(signal.profileVersion, profileJson.profileVersion);
    assert.equal(signal.pageInstanceId, 'page-1');
    assert.equal(signal.pageRevision, 1);
    assert.equal(signal.locale, 'en-US');
    assert.equal(signal.ts, new Date(epoch).toISOString());
  });
  assert.deepEqual(collector.signals().map(signal => signal.source), ['track', 'data-attribute', 'acdl']);
});
test('rejected input produces a bounded diagnostic and no raw observation or sequence gap', () => {
  const { collector, diagnostics } = collectorSetup();
  collector.track('destination.viewed', { entityIds: ['email@example.com'], entityType: 'forged' });
  collector.track('facet.selected', { facetId: 'pace', valueIds: ['unlisted'] });
  collector.track('entities.compared', { entityIds: ['one'], entityType: 'package' });
  collector.track('info.sought', { topicId: 'unknown', rawText: 'private form contents' });
  collector.track('hesitation', { status: 'active' });
  assert.equal(collector.signals().length, 0);
  assert.ok(diagnostics.length);
  assert.ok(diagnostics.every(value => JSON.stringify(value).length < 100));
  assert.doesNotMatch(JSON.stringify(diagnostics), /email|private|unlisted/);
  assert.equal(collector.track('info.sought', { topicId: 'sample-price' })?.seq, 1);
});
test('mapped field paths are own-property only and cannot read prototype data', () => {
  const { collector } = collectorSetup();
  assert.equal(collector.track('destination.viewed', Object.create({ entityIds: ['japan'] })), undefined);
  const profile: SiteProfile = structuredClone(activeProfile().profile);
  profile.signalMap.find(mapping => mapping.id === 'destination')!.fields!.entityIds = '__proto__.entityIds';
  assert.equal(collectorSetup(profile).collector.track('destination.viewed', { entityIds: ['japan'] }), undefined);
  const payload = { get entityIds() { throw new Error('must not execute an accessor'); } };
  assert.equal(collector.track('destination.viewed', payload), undefined);
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(collector.track('destination.viewed', { entityIds: [circular] }), undefined);
});
test('ACDL listener is removed; plain-array queues restore the original push', () => {
  const { collector } = collectorSetup();
  const listeners = new Set<(event: unknown) => void>();
  const layer: DataLayer = [];
  layer.addEventListener = (_, listener) => { listeners.add(listener); };
  layer.removeEventListener = (_, listener) => { listeners.delete(listener); };
  const stop = connectDataLayer(layer, collector);
  listeners.forEach(listener => listener({ event: 'info.view', eventInfo: { topicId: 'practical-planning' } }));
  assert.equal(collector.signals().length, 1);
  stop();
  assert.equal(listeners.size, 0);
  const queued: DataLayer = [];
  const push = queued.push;
  const unqueue = connectDataLayer(queued, collector);
  unqueue();
  assert.equal(queued.push, push);
  assert.equal(queued.filter(value => typeof value === 'function').length, 0);
});
test('raw observations and inferred states remain separate, thresholds and facets come from profile', () => {
  const collector = fixtureSignals();
  collector.track('facet.selected', { facetId: 'pace', valueIds: ['balanced'] });
  const profile = structuredClone(activeProfile().profile);
  const derive = () => deriveJourney(profile, collector.signals(), { now: epoch, page: context })!;
  assert.equal(derive().derived.hesitation.status, 'active');
  assert.equal(matchMoment(profile, derive())?.id, 'unresolved-exploration');
  assert.equal(derive().facets[0].facetId, 'pace');
  assert.equal(validateContract('JourneyState', derive()).valid, true);
  profile.momentRules.derivedStates.hesitation.params.minInfoSought = 3;
  assert.equal(derive().derived.hesitation.status, 'inactive');
  profile.momentRules.derivedStates.hesitation.params.unsupported = 1;
  assert.equal(derive().derived.hesitation.status, 'uncertain');
});
test('one Bali–Switzerland comparison activates without practical-info signals while safeguards remain in force', () => {
  const active = activeProfile();
  const { collector } = collectorSetup(active.profile);
  collector.track('page.viewed');
  collector.track('entities.compared', { entityIds: ['bali', 'switzerland'], entityType: 'destination' });
  const journey = deriveJourney(active.profile, collector.signals(), { now: epoch, page: context })!;
  assert.equal(journey.derived.hesitation.status, 'active');
  assert.equal(matchMoment(active.profile, journey)?.id, 'unresolved-exploration');
  assert.deepEqual(journey.raw.signals.at(-1)?.entityIds, ['bali', 'switzerland']);
  const base = { consent: 'granted' as const, active, journey, exposure: emptyExposure(), chatActive: false, formFocused: false, now: epoch };
  assert.equal(evaluateSuppression(base).allowed, true);
  assert.ok(evaluateSuppression({ ...base, exposure: { count: 2, dismissed: false } }).reasonCodes.includes('exposure.limit'));
  collector.track('booking.started', { flowId: 'trip' });
  const booking = deriveJourney(active.profile, collector.signals(), { now: epoch, page: context })!;
  assert.ok(evaluateSuppression({ ...base, journey: booking }).reasonCodes.includes('transaction.active'));
});
test('operations persist across exit and inactivity; only confirmed matching terminal events end them', () => {
  const collector = fixtureSignals();
  const profile = structuredClone(activeProfile().profile);
  const derive = (confirmed = false) => deriveJourney(profile, collector.signals(), { now: epoch + 10_000_000, page: { ...context, pageType: 'home' }, terminalConfirmed: () => confirmed })!;
  collector.track('booking.started', { flowId: 'flow-a' });
  assert.equal(derive().derived.inProgress.status, 'active');
  profile.momentRules.derivedStates.inProgress.idleTimeoutMs = 100;
  assert.equal(derive().derived.inProgress.status, 'uncertain');
  delete profile.momentRules.derivedStates.inProgress.idleTimeoutMs;
  collector.track('booking.confirmed-complete', { flowId: 'flow-a' });
  assert.notEqual(derive().derived.inProgress.status, 'inactive', 'unconfirmed completion is not authority');
  assert.equal(derive(true).derived.inProgress.status, 'inactive');
  collector.track('booking.started', { flowId: 'flow-b' });
  collector.track('booking.confirmed-cancel', { flowId: 'wrong-flow' });
  assert.equal(derive(true).derived.inProgress.status, 'uncertain');
});
test('confirmed cancellation clears only its matching flow and is never a success phase', () => {
  const collector = fixtureSignals();
  collector.track('booking.started', { flowId: 'a' });
  collector.track('booking.started', { flowId: 'b' });
  collector.track('booking.confirmed-cancel', { flowId: 'a' });
  const derive = () => deriveJourney(activeProfile().profile, collector.signals(), { now: epoch, page: context, terminalConfirmed: () => true })!;
  assert.equal(derive().derived.inProgress.status, 'active');
  collector.track('booking.confirmed-cancel', { flowId: 'b' });
  assert.equal(derive().derived.inProgress.status, 'inactive');
  assert.equal(collector.signals().filter(signal => signal.kind === 'transaction.step' && signal.attributes.phase === 'complete').length, 0);
});
test('transactional page with no operation identifier remains uncertain after leaving it', () => {
  const profile = activeProfile().profile;
  const { collector } = collectorSetup(profile);
  const onPage: CanonicalSignal = { ...fixtureSignals().signals()[0], pageType: 'booking' };
  const signals = [onPage, ...collector.signals()];
  assert.equal(deriveJourney(profile, signals, { now: epoch, page: context })!.derived.inProgress.status, 'uncertain');
});

test('D16 suppression table covers consent, invalid profile, chat, form, transactions and exposure', () => {
  const active = activeProfile();
  const journey = deriveJourney(active.profile, fixtureSignals().signals(), { now: epoch, page: context })!;
  const base = { consent: 'granted' as const, active, journey, exposure: emptyExposure(), chatActive: false, formFocused: false, now: epoch };
  const cases: [string, Partial<Parameters<typeof evaluateSuppression>[0]>, string][] = [
    ['pending', { consent: 'pending' }, 'consent.pending'],
    ['denied', { consent: 'denied' }, 'consent.denied'],
    ['invalid profile', { active: undefined }, 'profile.unavailable'],
    ['missing state', { journey: undefined }, 'journey.unavailable'],
    ['chat', { chatActive: true }, 'chat.active'],
    ['form', { formFocused: true }, 'form.focused'],
    ['active operation', { journey: { ...journey, derived: { ...journey.derived, inProgress: { ...journey.derived.inProgress, status: 'active' } } } }, 'transaction.active'],
    ['uncertain operation', { journey: { ...journey, derived: { ...journey.derived, inProgress: { ...journey.derived.inProgress, status: 'uncertain' } } } }, 'transaction.uncertain'],
    ['dismissed', { exposure: { count: 1, dismissed: true } }, 'exposure.dismissed'],
    ['cap', { exposure: { count: 2, dismissed: false } }, 'exposure.limit'],
    ['cooldown', { exposure: { count: 1, dismissed: false, lastShownAt: epoch - 599999 } }, 'exposure.cooldown'],
    ['weaker policy', { active: { ...active, exposure: { ...active.exposure, minNudgeIntervalMs: 120000 } } }, 'profile.policy_violation'],
  ];
  assert.equal(evaluateSuppression(base).allowed, true);
  for (const [label, change, reason] of cases) {
    const result = evaluateSuppression({ ...base, ...change });
    assert.equal(result.allowed, false, label);
    assert.ok(result.reasonCodes.includes(reason as typeof result.reasonCodes[number]), label);
  }
  assert.equal(evaluateSuppression({ ...base, exposure: { count: 1, dismissed: false, lastShownAt: epoch - 600000 } }).allowed, true);
});

test('activated settings change real suppression without bypassing safety gates', () => {
  const active = activeProfile();
  const journey = deriveJourney(active.profile, fixtureSignals().signals(), { now: epoch, page: context })!;
  const settings = { ...defaultNudgeSettings(active.profile.profileId), minIntervalMs: 120_000,
    maxNudgesPerSession: 4, suppressAfterNotNow: false, suppressWhileChatOpen: false };
  const base = { consent: 'granted' as const, active, journey,
    exposure: { count: 2, dismissed: true, lastShownAt: epoch - 120_000 },
    chatActive: true, formFocused: false, now: epoch, settings };
  assert.equal(evaluateSuppression(base).allowed, true);
  assert.ok(evaluateSuppression({ ...base, settings: { ...settings, minIntervalMs: 120_001 } }).reasonCodes.includes('exposure.cooldown'));
  assert.ok(evaluateSuppression({ ...base, settings: { ...settings, maxNudgesPerSession: 2 } }).reasonCodes.includes('exposure.limit'));
  assert.ok(evaluateSuppression({ ...base, settings: { ...settings, suppressAfterNotNow: true } }).reasonCodes.includes('exposure.dismissed'));
  assert.ok(evaluateSuppression({ ...base, settings: { ...settings, suppressWhileChatOpen: true } }).reasonCodes.includes('chat.active'));
  assert.ok(evaluateSuppression({ ...base, consent: 'denied' }).reasonCodes.includes('consent.denied'));
  assert.ok(evaluateSuppression({ ...base, formFocused: true }).reasonCodes.includes('form.focused'));
  const booking = { ...journey, derived: { ...journey.derived, inProgress: { ...journey.derived.inProgress, status: 'active' as const } } };
  assert.ok(evaluateSuppression({ ...base, journey: booking }).reasonCodes.includes('transaction.active'));
});

function runtimeSetup() {
  let clock = epoch;
  let id = 0;
  let sid = 'session-1';
  let active: ReturnType<typeof activeProfile> | undefined = activeProfile();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const create = () => createJourneyRuntime({
    availability: () => ({ consent: 'granted', active }), sessionId: () => sid, storage,
    now: () => clock, makeId: () => `id-${++id}`, terminalConfirmed: signal => signal.source === 'track',
  });
  return { create, data, advance: (ms: number) => { clock += ms; }, session: (next: string) => { sid = next; }, profile: (next: typeof active) => { active = next; } };
}
test('visible nudge counting is atomic; only its own exposure is discounted on freshness recheck', () => {
  const host = runtimeSetup();
  const runtime = host.create();
  runtime.setPage('package-detail', '/item');
  const page = runtime.getPage()!;
  assert.equal(runtime.shown().allowed, true);
  assert.equal(runtime.shown().allowed, false);
  assert.equal(runtime.evaluate({ currentNudge: true }).allowed, true);
  assert.deepEqual(runtime.evaluate({ currentNudge: true, formFocused: true }).reasonCodes, ['form.focused']);
  host.advance(600000);
  runtime.revise();
  assert.equal(runtime.getPage()!.pageRevision, page.pageRevision + 1);
  assert.equal(runtime.shown().allowed, true);
  assert.equal(runtime.evaluate({ currentNudge: true }).allowed, true);
  host.advance(600000);
  runtime.revise();
  assert.ok(runtime.evaluate({ currentNudge: true }).reasonCodes.includes('exposure.limit'));
});
test('exposure, dismissal and operation safety survive reload and profile changes, but not a new session', () => {
  const host = runtimeSetup();
  const first = host.create();
  first.setPage('package-detail', '/item');
  first.shown();
  first.dismiss();
  first.track('booking.started', { flowId: 'operation' });
  const reloaded = host.create();
  reloaded.setPage('home', '/');
  assert.notEqual(reloaded.getPage()?.pageInstanceId, first.getPage()?.pageInstanceId);
  assert.ok(reloaded.evaluate().reasonCodes.includes('exposure.dismissed'));
  assert.ok(reloaded.evaluate().reasonCodes.includes('transaction.active'));
  host.profile(activeProfile({ ...profileJson, profileVersion: '1.1.1' }));
  reloaded.setPage('home', '/new');
  assert.ok(reloaded.evaluate().reasonCodes.includes('transaction.uncertain'));
  assert.ok(reloaded.evaluate().reasonCodes.includes('exposure.dismissed'));
  host.session('session-2');
  reloaded.setPage('home', '/');
  assert.equal(reloaded.evaluate().allowed, true);
});
test('a different domain uses the same collector, facets, derivation and policy without site branches', () => {
  const active = activeProfile(retailProfile);
  let time = epoch;
  const runtime = createJourneyRuntime({
    availability: () => ({ consent: 'granted', active }),
    sessionId: () => 'retail-session', now: () => time,
  });
  runtime.setPage('product', '/example');
  runtime.ingest('acdl', 'page:loaded');
  runtime.ingest('acdl', 'compare:opened', { skus: ['sku-LAP-14', 'sku-LAP-16'] });
  runtime.ingest('acdl', 'compare:opened', { skus: ['sku-LAP-14', 'sku-LAP-16'] });
  assert.equal(runtime.getJourney()?.derived.hesitation.status, 'inactive');
  time += 45000;
  const journey = runtime.getJourney()!;
  assert.equal(journey.derived.hesitation.status, 'active');
  assert.equal(journey.locale, 'en-GB');
  assert.equal(validateContract('JourneyState', journey).valid, true);
  assert.equal(runtime.evaluate().allowed, true);
  runtime.ingest('acdl', 'checkout:step', { phase: 'start' });
  assert.ok(runtime.evaluate().reasonCodes.includes('transaction.uncertain'));
});
test('corrupt persisted state and a capped collector fail closed instead of losing booking protection', () => {
  const host = runtimeSetup();
  host.data.set('aaa.runtime.v1', '{');
  const runtime = host.create();
  runtime.setPage('home', '/');
  assert.equal(runtime.evaluate().allowed, false);
  const { collector, diagnostics } = collectorSetup();
  for (let i = 0; i < 301; i++) collector.track('page.viewed');
  assert.equal(collector.signals().length, 300);
  assert.equal(collector.incomplete(), true);
  assert.ok(JSON.stringify(diagnostics).includes('signal.capacity'));
});
test('existing reset and expiry hooks can clear the canonical snapshot and in-memory state', () => {
  const host = runtimeSetup();
  const runtime = host.create();
  runtime.setPage('home', '/');
  runtime.shown();
  runtime.clear();
  assert.equal(host.data.has('aaa.runtime.v1'), false);
  assert.equal(runtime.getJourney(), undefined);
  host.session('session-new');
  runtime.setPage('home', '/');
  assert.equal(runtime.evaluate().allowed, true);
});
test('production TypeScript in aaa has no domain branches, fixtures or site dependencies', () => {
  const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
  const files = walk(fileURLToPath(new URL('.', import.meta.url))).filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  const forbidden = /\b(?:wanderly|bali|maldives|japan|destination|booking|travel|BUDGET|ACTIVITIES|TRIP_LENGTH)\b/i;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, forbidden, file);
    assert.doesNotMatch(text, /from\s+['"][^'"]*(?:\/sites\/|\/lib\/)/, file);
  }
});
