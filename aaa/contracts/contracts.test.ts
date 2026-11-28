import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { retailAbstainResult, retailFallbackResult, retailJourney, retailProfile, retailRequest, retailSignals } from '../../sites/retail/contract-examples.ts';
import { travelJourney, travelProfile, travelRequest, travelResult, travelSignals } from '../../sites/wanderly/contract-examples.ts';
import { derivedStateKinds, provenances, rawSignalKinds, starterOutcomes, transactionPhases, type SiteProfile, type Starter } from './types.ts';
import { allSchemas, contractSchemas, validateContract, type ContractName } from './validate.ts';

const clone = <T>(v: T): T => structuredClone(v);
const errorsOf = (name: ContractName, value: unknown) => {
  const r = validateContract(name, value);
  return r.valid ? [] : r.errors.map(e => `${e.path} ${e.message}`);
};
const assertRejected = (name: ContractName, value: unknown, fragment: string) => {
  const errors = errorsOf(name, value);
  assert.ok(errors.some(e => e.includes(fragment)), `expected "${fragment}" in ${JSON.stringify(errors)}`);
};

test('travel and non-travel fixtures validate against the same generic contracts', () => {
  const fixtures: [ContractName, unknown][] = [
    ...[...travelSignals, ...retailSignals].map(s => ['CanonicalSignal', s] as [ContractName, unknown]),
    ['JourneyState', travelJourney], ['JourneyState', retailJourney],
    ['SiteProfile', travelProfile], ['SiteProfile', retailProfile],
    ['StarterRequest', travelRequest], ['StarterRequest', retailRequest],
    ['StarterResult', travelResult], ['StarterResult', retailFallbackResult], ['StarterResult', retailAbstainResult],
  ];
  for (const [name, value] of fixtures) assert.deepEqual(errorsOf(name, value), [], name);
});

test('contract files carry no site or domain vocabulary', () => {
  const dir = new URL('.', import.meta.url);
  const files = [...readdirSync(new URL('v1/', dir)).map(f => `v1/${f}`), 'types.ts', 'validate.ts'];
  const domainTerms = /\b(travel\w*|destination\w*|package\w*|booking\w*|hotel\w*|visa|trip\w*|flight\w*|budget|wanderly|volt|product\w*|checkout|laptop\w*|sku)\b/i;
  for (const file of files) {
    const match = readFileSync(new URL(file, dir), 'utf8').match(domainTerms);
    assert.equal(match?.[0], undefined, file);
  }
});

test('every contract declares schemaVersion and the locale/provenance/pageRevision fields where relevant', () => {
  for (const schema of Object.values(contractSchemas) as { required: string[] }[]) assert.ok(schema.required.includes('schemaVersion'));
  const signal = contractSchemas.CanonicalSignal.required;
  for (const field of ['profileVersion', 'seq', 'pageInstanceId', 'pageRevision', 'ts', 'locale', 'entityIds', 'provenance']) assert.ok(signal.includes(field), field);
  assert.ok(contractSchemas.JourneyState.required.includes('locale') && contractSchemas.JourneyState.required.includes('page'));
  for (const field of ['locale', 'pageInstanceId', 'pageRevision', 'profileVersion', 'expiresAt']) assert.ok(contractSchemas.StarterResult.required.includes(field), field);
  const missingRevision = clone(travelSignals[0]) as Record<string, unknown>;
  delete missingRevision.pageRevision;
  assertRejected('CanonicalSignal', missingRevision, 'missing required property "pageRevision"');
  assertRejected('CanonicalSignal', { ...travelSignals[0], schemaVersion: '2.0.0' }, '/schemaVersion must equal');
  assertRejected('CanonicalSignal', { ...travelSignals[0], locale: 'english' }, '/locale must match');
});

test('TypeScript enum tuples mirror the schemas', () => {
  const common = allSchemas.find(s => s.$id === 'urn:aaa:contracts:v1:common') as unknown as { $defs: Record<string, { enum: string[] }> };
  assert.deepEqual(common.$defs.rawSignalKind.enum, [...rawSignalKinds]);
  assert.deepEqual(common.$defs.derivedStateKind.enum, [...derivedStateKinds]);
  assert.deepEqual(common.$defs.provenance.enum, [...provenances]);
  assert.deepEqual(common.$defs.transactionPhase.enum, [...transactionPhases]);
  assert.deepEqual(contractSchemas.StarterResult.properties.outcome.enum, [...starterOutcomes]);
});

test('raw signals and derived states stay separate', () => {
  assertRejected('CanonicalSignal', { ...travelSignals[0], kind: 'hesitation' }, '/kind must be one of');
  const explicitDerived = clone(travelJourney);
  (explicitDerived.derived.hesitation as { provenance: string }).provenance = 'explicit';
  assertRejected('JourneyState', explicitDerived, '/derived/hesitation/provenance must equal "inferred"');
  const smuggled = clone(travelJourney) as unknown as { derived: Record<string, unknown> };
  smuggled.derived.custom = { status: 'active', provenance: 'inferred', basisSignalIds: [] };
  assertRejected('JourneyState', smuggled, '/derived/custom is not an allowed property');
});

test('signals are rejected with diagnostics for kind-specific or privacy violations', () => {
  assertRejected('CanonicalSignal', { ...travelSignals[2], entityIds: ['dest-bali'] }, '/entityIds must have at least 2 items');
  assertRejected('CanonicalSignal', { ...travelSignals[3], attributes: { facetId: 'budget', valueIds: ['under $2000 please'] } }, '/attributes/valueIds/0 must match');
  assertRejected('CanonicalSignal', { ...travelSignals[0], attributes: { query: 'raw search text' } }, '/attributes/query is not an allowed property');
  assertRejected('CanonicalSignal', { ...travelSignals[0], email: 'a@b.c' }, '/email is not an allowed property');
  assertRejected('CanonicalSignal', { ...travelSignals[5], attributes: { phase: 'paid' } }, '/attributes/phase must be one of');
  assert.deepEqual(errorsOf('CanonicalSignal', null), ['/ must be object']);
});

test('site profiles are declarative and URL-free', () => {
  assertRejected('SiteProfile', { ...retailProfile, offerSource: { ...retailProfile.offerSource, url: 'https://example.com' } }, '/offerSource/url is not an allowed property');
  const offerless = clone(travelProfile) as unknown as { playbooks: Record<string, unknown>[] };
  delete offerless.playbooks[2].offerIds;
  assertRejected('SiteProfile', offerless, '/playbooks/2 is missing required property "offerIds"');
  assertRejected('SiteProfile', { ...travelProfile, contextMap: { maxChars: 100, fields: [{ key: 'all', from: 'raw.signals' }] } }, '/contextMap/fields/0/from must match');
  assertRejected('SiteProfile', { ...travelProfile, profileVersion: 'latest' }, '/profileVersion must match');
});

test('profile thresholds and success configuration can be omitted without inventing success', () => {
  const optional: SiteProfile = clone(retailProfile);
  delete optional.successEvent;
  assert.deepEqual(errorsOf('SiteProfile', optional), []);
  optional.momentRules.derivedStates.inProgress.idleTimeoutMs = 600000;
  assert.deepEqual(errorsOf('SiteProfile', optional), []);
  optional.momentRules.derivedStates.inProgress.idleTimeoutMs = 0;
  assertRejected('SiteProfile', optional, '/momentRules/derivedStates/inProgress/idleTimeoutMs must be >= 1');
  assertRejected('SiteProfile', { ...optional, successEvent: null }, '/successEvent must be object');
});

test('exposure budgets validate generic shape, not demo policy', () => {
  const withBudget = (exposureBudget: unknown) => ({
    ...travelProfile, momentRules: { ...travelProfile.momentRules, exposureBudget },
  });
  for (const budget of [
    { maxNudgesPerSession: 0 }, { minNudgeIntervalMs: 0 },
    { maxNudgesPerSession: 2, minNudgeIntervalMs: 600000 },
    { maxNudgesPerSession: 20, minNudgeIntervalMs: 1 },
  ]) assert.deepEqual(errorsOf('SiteProfile', withBudget(budget)), []);
  for (const [budget, fragment] of [
    [{}, 'must have at least 1 properties'],
    [{ maxNudgesPerSession: -1 }, '/maxNudgesPerSession must be >= 0'],
    [{ minNudgeIntervalMs: -1 }, '/minNudgeIntervalMs must be >= 0'],
    [{ maxNudgesPerSession: 1.5 }, '/maxNudgesPerSession must be integer'],
    [{ minNudgeIntervalMs: '600000' }, '/minNudgeIntervalMs must be integer'],
    [{ maxNudgesPerSession: 2, unknown: true }, '/unknown is not an allowed property'],
  ] as const) assertRejected('SiteProfile', withBudget(budget), fragment);
});

test('shared phases validate through nested references and cancellation cannot configure success', () => {
  for (const phase of transactionPhases) {
    const signal = { ...travelSignals[5], attributes: { phase, flowId: 'demo-flow-1' } };
    const journey = { ...travelJourney, raw: { signals: [signal] } };
    assert.deepEqual(errorsOf('CanonicalSignal', signal), []);
    assert.deepEqual(errorsOf('JourneyState', journey), []);
    assert.deepEqual(errorsOf('StarterRequest', { ...travelRequest, journey }), []);
    const profile: SiteProfile = {
      ...travelProfile,
      signalMap: [{ ...travelProfile.signalMap[3], fields: { phase: { value: phase } } }],
    };
    assert.deepEqual(errorsOf('SiteProfile', profile), []);
  }
  const withSuccess = (successEvent: unknown) => ({ ...travelProfile, successEvent });
  for (const successEvent of [
    { id: 'done', signalKind: 'transaction.step', transactionPhase: 'complete' },
    { id: 'step', signalKind: 'transaction.step' },
    { id: 'view', signalKind: 'page.viewed' },
  ]) assert.deepEqual(errorsOf('SiteProfile', withSuccess(successEvent)), []);
  assertRejected('SiteProfile', withSuccess({
    id: 'cancelled', signalKind: 'transaction.step', transactionPhase: 'cancel',
  }), '/successEvent/transactionPhase must not match the disallowed shape');
  assertRejected('SiteProfile', withSuccess({
    id: 'view', signalKind: 'page.viewed', transactionPhase: 'complete',
  }), '/successEvent must not match the disallowed shape');
  assertRejected('SiteProfile', withSuccess({
    id: 'done', signalKind: 'transaction.step', transactionPhase: 'paused',
  }), '/successEvent/transactionPhase must be one of');
  // @ts-expect-error A cancellation cannot configure visitor success.
  const cancelledSuccess: SiteProfile['successEvent'] = { id: 'cancelled', signalKind: 'transaction.step', transactionPhase: 'cancel' };
  assertRejected('SiteProfile', withSuccess(cancelledSuccess), 'must not match the disallowed shape');
  // @ts-expect-error Only transaction signals can specify a success phase.
  const nonTransactionPhase: SiteProfile['successEvent'] = { id: 'view', signalKind: 'page.viewed', transactionPhase: 'complete' };
  assertRejected('SiteProfile', withSuccess(nonTransactionPhase), '/successEvent must not match the disallowed shape');
});

test('signal mappings accept paths and typed fixed values', () => {
  const withFields = (fields: unknown) => ({
    ...travelProfile,
    signalMap: [{ ...travelProfile.signalMap[1], fields }],
  });
  const paths: NonNullable<SiteProfile['signalMap'][number]['fields']> = {
    entityIds: 'event.ids', entityType: 'event.type', topicId: 'event.topic', facetId: 'event.facet',
    valueIds: 'event.values', phase: 'event.phase', flowId: 'event.flow', stepId: 'event.step',
  };
  const fixed: NonNullable<SiteProfile['signalMap'][number]['fields']> = {
    entityIds: { value: ['pkg-1', 'pkg-2'] }, entityType: { value: 'package' },
    topicId: { value: 'visa' }, facetId: { value: 'budget' }, valueIds: { value: ['mid', 'high'] },
    phase: { value: 'step' }, flowId: { value: 'booking' }, stepId: { value: 'travellers' },
  };
  for (const fields of [paths, fixed, { ...fixed, entityIds: 'event.ids' }, { entityIds: { value: [] } }, { phase: 'step' }]) {
    assert.deepEqual(errorsOf('SiteProfile', withFields(fields)), []);
  }

  const invalid: [string, unknown][] = [
    ['entityType', 'event..type'],
    ['entityType', { value: 'not an id' }],
    ['topicId', { value: ['visa'] }],
    ['entityIds', { value: 'pkg-1' }],
    ['entityIds', { value: ['pkg-1', 'pkg-1'] }],
    ['valueIds', { value: ['mid', 1] }],
    ['flowId', { value: 'booking', extra: true }],
    ['stepId', {}],
  ];
  for (const [field, value] of invalid) {
    assertRejected('SiteProfile', withFields({ [field]: value }), `/signalMap/0/fields/${field} does not match exactly one allowed shape`);
  }
  // @ts-expect-error Fixed phases must be transaction phases.
  const invalidPhase: NonNullable<SiteProfile['signalMap'][number]['fields']> = { phase: { value: 'paused' } };
  assertRejected('SiteProfile', withFields(invalidPhase), '/signalMap/0/fields/phase does not match exactly one allowed shape');
  assertRejected('SiteProfile', withFields({ unknownField: 'event.value' }), '/signalMap/0/fields/unknownField is not an allowed property');
});

test('validator only honours own properties and real calendar timestamps', () => {
  assertRejected('CanonicalSignal', { ...travelSignals[0], constructor: 'x' }, '/constructor is not an allowed property');
  const inheritedRequired = Object.create(clone(travelSignals[0]) as object) as Record<string, unknown>;
  assertRejected('CanonicalSignal', inheritedRequired, 'missing required property "schemaVersion"');
  for (const ts of ['2026-02-30T10:00:00Z', '2025-02-29T10:00:00Z', '2026-13-01T10:00:00Z', '2026-11-25T24:00:00Z', '2026-11-25T10:00:60Z']) {
    assertRejected('CanonicalSignal', { ...travelSignals[0], ts }, '/ts must be a valid date-time');
  }
  assert.deepEqual(errorsOf('CanonicalSignal', { ...travelSignals[0], ts: '2028-02-29T23:59:59.123Z' }), []);
});

test('starter requests never carry tenant identity', () => {
  assertRejected('StarterRequest', { ...travelRequest, tenantId: 'tenant-other' }, '/tenantId is not an allowed property');
});

test('starter results enforce outcome consistency and starter caps', () => {
  assertRejected('StarterResult', { ...retailAbstainResult, starters: retailFallbackResult.starters }, '/starters must have at most 0 items');
  assertRejected('StarterResult', { ...retailAbstainResult, reasonCodes: [] }, '/reasonCodes must have at least 1 items');
  assertRejected('StarterResult', { ...travelResult, playbookId: null }, '/playbookId must be string');
  assertRejected('StarterResult', { ...travelResult, starters: [] }, '/starters must have at least 1 items');
  const [primary, commercial] = travelResult.starters;
  assertRejected('StarterResult', { ...travelResult, starters: [primary, commercial, { ...commercial, starterId: 'st-3' }] }, '/starters must contain at most 1 matching');
  assertRejected('StarterResult', { ...travelResult, starters: [primary, { ...primary, starterId: 'st-9' }] }, '/starters must contain at most 1 matching');
  const helper = { ...primary, role: 'followup' as const };
  assertRejected('StarterResult', { ...travelResult, starters: [primary, ...['a', 'b', 'c'].map(id => ({ ...helper, starterId: id }))] }, '/starters must have at most 3 items');
  assertRejected('StarterResult', { ...retailFallbackResult, reasonCodes: [] }, '/reasonCodes must have at least 1 items');
  assertRejected('StarterResult', { ...travelResult, starters: [{ ...primary, kind: 'commercial' }] }, '/starters must contain at least 1 matching');
  assertRejected('StarterResult', { ...travelResult, starters: [{ ...commercial, role: 'followup' }] }, '/starters must contain at least 1 matching');
  assertRejected('StarterResult', { ...travelResult, offerIds: [] }, '/offerIds must have at least 1 items');
  const { templateId: _omitted, ...withoutTemplate } = retailFallbackResult.starters[0];
  assertRejected('StarterResult', { ...retailFallbackResult, starters: [withoutTemplate] }, '/starters/0 is missing required property "templateId"');
});

test('starter offer IDs are required for commercial starters and bind to the result', () => {
  const [primary, commercial] = travelResult.starters;
  // @ts-expect-error Commercial starters require an offer ID.
  const withoutOffer: Starter = { starterId: 'st-no-offer', role: 'followup', kind: 'commercial', text: 'Offer' };
  assertRejected('StarterResult', { ...travelResult, starters: [primary, withoutOffer] }, '/starters/1 is missing required property "offerId"');
  assertRejected('StarterResult', { ...travelResult, starters: [primary, { ...commercial, offerId: 'not an id' }] }, '/starters/1/offerId must match');
  assertRejected('StarterResult', { ...travelResult, starters: [primary, { ...commercial, offerId: 'offer-other' }] }, '/starters/1/offerId must appear in result offerIds');
  assert.deepEqual(errorsOf('StarterResult', { ...travelResult, offerIds: ['offer-other', 'offer-early-bird'] }), []);

  const helpfulWithOffer = { ...travelResult, starters: [{ ...primary, offerId: 'offer-early-bird' }] };
  assert.deepEqual(errorsOf('StarterResult', helpfulWithOffer), []);
  assertRejected('StarterResult', { ...helpfulWithOffer, offerIds: [] }, '/starters/0/offerId must appear in result offerIds');

  const inheritedOffer = Object.assign(Object.create({ offerId: 'offer-other' }) as object, primary);
  assert.deepEqual(errorsOf('StarterResult', { ...travelResult, starters: [inheritedOffer], offerIds: [] }), []);
});

test('validator requires exactly one matching oneOf alternative', () => {
  const schemas = contractSchemas as unknown as Record<string, Record<string, unknown>>;
  const original = schemas.StarterRequest.properties;
  schemas.StarterRequest.properties = { ...(original as object), requestId: { oneOf: [{ type: 'string' }, { type: 'string' }] } };
  try {
    assertRejected('StarterRequest', travelRequest, '/requestId does not match exactly one allowed shape');
  } finally {
    schemas.StarterRequest.properties = original;
  }
});

test('validator refuses schemas that use unsupported keywords', () => {
  const schemas = contractSchemas as unknown as Record<string, Record<string, unknown>>;
  const original = schemas.StarterRequest.properties;
  schemas.StarterRequest.properties = { ...(original as object), requestId: { maximum: 1 } };
  try {
    assert.throws(() => validateContract('StarterRequest', travelRequest), /Unsupported schema keyword "maximum"/);
  } finally {
    schemas.StarterRequest.properties = original;
  }
});
