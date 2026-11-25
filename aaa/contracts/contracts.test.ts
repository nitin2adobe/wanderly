import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { retailAbstainResult, retailFallbackResult, retailJourney, retailProfile, retailRequest, retailSignals } from './examples/retail.ts';
import { travelJourney, travelProfile, travelRequest, travelResult, travelSignals } from './examples/travel.ts';
import { derivedStateKinds, provenances, rawSignalKinds, starterOutcomes, transactionPhases } from './types.ts';
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

test('site profiles are declarative, URL-free and supply their own thresholds', () => {
  assertRejected('SiteProfile', { ...retailProfile, offerSource: { ...retailProfile.offerSource, url: 'https://example.com' } }, '/offerSource/url is not an allowed property');
  const noTimeout = clone(retailProfile) as unknown as { momentRules: { derivedStates: { inProgress: Record<string, unknown> } } };
  delete noTimeout.momentRules.derivedStates.inProgress.idleTimeoutMs;
  assertRejected('SiteProfile', noTimeout, 'missing required property "idleTimeoutMs"');
  const offerless = clone(travelProfile) as unknown as { playbooks: Record<string, unknown>[] };
  delete offerless.playbooks[2].offerIds;
  assertRejected('SiteProfile', offerless, '/playbooks/2 is missing required property "offerIds"');
  assertRejected('SiteProfile', { ...travelProfile, contextMap: { maxChars: 100, fields: [{ key: 'all', from: 'raw.signals' }] } }, '/contextMap/fields/0/from must match');
  assertRejected('SiteProfile', { ...travelProfile, profileVersion: 'latest' }, '/profileVersion must match');
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
