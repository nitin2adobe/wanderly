import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { retailProfile } from '../../sites/retail/contract-examples.ts';
import { travelProfile } from '../../sites/wanderly/contract-examples.ts';
import type { SiteProfile } from '../contracts/types.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY, type ProfileResult } from './loader.ts';

const clone = <T>(v: T): T => structuredClone(v);
const registry = () => {
  let n = 0;
  return createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY, createCorrelationId: () => `corr-${++n}` });
};
const withVersion = (profile: SiteProfile, profileVersion: string): SiteProfile => ({ ...clone(profile), profileVersion });
const diagnosticOf = (result: ProfileResult) => {
  assert.equal(result.ok, false);
  return result.ok ? undefined : result.diagnostic;
};
const activeVersion = (r: ReturnType<typeof registry>) => {
  const state = r.state();
  return state.enabled ? state.active.profile.profileVersion : undefined;
};

test('AAA stays disabled until a valid profile is published; travel and non-travel profiles load', () => {
  const r = registry();
  assert.deepEqual(r.state(), { enabled: false });
  assert.equal(r.publish(travelProfile).ok, true);
  assert.equal(r.publish(JSON.stringify(retailProfile)).ok, true);
  assert.deepEqual(r.versions(), [{ profileId: 'wanderly', profileVersion: '1.0.0' }, { profileId: 'volt-electronics', profileVersion: '2.1.0' }]);
});

test('contract-optional fields stay optional: no successEvent, idleTimeoutMs or exposure fields required', () => {
  const minimal = clone(retailProfile) as SiteProfile;
  delete minimal.successEvent;
  delete minimal.momentRules.exposureBudget;
  assert.equal(minimal.momentRules.derivedStates.inProgress.idleTimeoutMs, undefined);
  const result = registry().publish(minimal);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.active.profile.successEvent, undefined);
});

test('invalid profiles disable AAA with a bounded diagnostic that leaks no values or schema text', () => {
  const r = registry();
  r.publish(travelProfile);
  const invalid = { ...clone(travelProfile), tenantId: 'jane.doe@example.com private' };
  const diagnostic = diagnosticOf(r.publish(invalid));
  assert.deepEqual(diagnostic, {
    code: 'contract.invalid', correlationId: 'corr-1', contract: 'SiteProfile', schemaId: 'urn:aaa:contracts:v1:site-profile', schemaVersion: '1.0.0',
    field: 'tenantId',
  });
  assert.deepEqual(r.state(), { enabled: false, diagnostic });
  assert.ok(!JSON.stringify(diagnostic).includes('jane'));

  const unsafeIds = { ...clone(travelProfile), profileId: 'has spaces <b>', successEvent: { id: 'x', signalKind: 'transaction.step', transactionPhase: 'cancel' } };
  const unsafe = diagnosticOf(r.publish(unsafeIds));
  assert.equal(unsafe && 'profileId' in unsafe, false);
  assert.equal(unsafe?.code, 'contract.invalid');

  const identifier = 'jane.doe.example.com';
  const version = `${'1'.repeat(1000)}.0.0`;
  const privateValues = diagnosticOf(r.publish({ ...clone(travelProfile), profileId: identifier, profileVersion: version, tenantId: 'invalid id' }));
  assert.ok(!JSON.stringify(privateValues).includes(identifier));
  assert.ok(!JSON.stringify(privateValues).includes(version));
  assert.ok(JSON.stringify(privateValues).length < 512);

  assert.equal(diagnosticOf(r.publish('{"profileId": '))?.code, 'profile.malformed');
  assert.equal(diagnosticOf(r.publish(null))?.code, 'contract.invalid');
  assert.equal(r.state().enabled, false);
});

test('returned state and diagnostics cannot mutate the registry', () => {
  const r = registry();
  r.publish(travelProfile);
  const active = r.state();
  assert.equal(Reflect.set(active, 'enabled', false), false);
  assert.equal(r.state().enabled, true);

  const result = r.publish('{');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(Reflect.set(result.diagnostic, 'code', 'leaked'), false);
  const disabled = r.state();
  assert.equal(Reflect.set(disabled, 'enabled', true), false);
  assert.equal(r.state().enabled, false);
  assert.equal(result.diagnostic.code, 'profile.malformed');
});

test('deployment policy is validated and isolated from later mutation', () => {
  const policy = { maxNudgesPerSession: 2, minNudgeIntervalMs: 600_000, suppressAfterDismissal: true as const };
  const r = createProfileRegistry({ policy });
  policy.maxNudgesPerSession = 10;
  policy.minNudgeIntervalMs = 0;
  const profile = clone(travelProfile) as SiteProfile;
  profile.momentRules.exposureBudget = { maxNudgesPerSession: 3 };
  assert.equal(diagnosticOf(r.publish(profile))?.code, 'profile.policy_violation');
  assert.throws(() => createProfileRegistry({ policy: { ...policy, minNudgeIntervalMs: NaN } }), /Invalid exposure policy/);
});

test('invalid diagnostic generators cannot leave AAA enabled', () => {
  const r = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY, createCorrelationId: () => 'x'.repeat(129) });
  assert.equal(r.publish(travelProfile).ok, true);
  assert.throws(() => r.publish('{'), /Invalid correlation ID/);
  assert.equal(r.state().enabled, false);
});

test('schema-valid profiles with unresolved or duplicate references are rejected', () => {
  const cases: [string, (p: SiteProfile) => void][] = [
    ['locales', p => { p.locales.default = 'fr-FR'; }],
    ['momentRules', p => { p.momentRules.rules[0].playbookIds = ['missing']; }],
    ['momentRules', p => { p.momentRules.derivedStates.inProgress.transactionPageTypes = ['missing']; }],
    ['playbooks', p => { p.playbooks[0].evidenceIds = ['missing']; }],
    ['playbooks', p => { p.playbooks[0].eligibility.facetIds = ['missing']; }],
    ['taxonomy', p => { p.taxonomy.pageTypes[0].funnelStageId = 'missing'; }],
    ['signalMap', p => { p.signalMap[1].id = p.signalMap[0].id; }],
    ['successEvent', p => { p.successEvent = { id: 'done', signalKind: 'page.viewed', pageTypes: ['missing'] }; }],
  ];
  for (const [field, mutate] of cases) {
    const profile = clone(travelProfile) as SiteProfile;
    mutate(profile);
    const diagnostic = diagnosticOf(registry().publish(profile));
    assert.deepEqual([diagnostic?.code, diagnostic?.field], ['profile.invalid_reference', field]);
  }
});

test('demo exposure policy is enforced separately: stricter allowed, weaker rejected, omitted fields keep safeguards', () => {
  const exposureOf = (exposureBudget: SiteProfile['momentRules']['exposureBudget']) => {
    const profile = clone(retailProfile) as SiteProfile;
    if (exposureBudget) profile.momentRules.exposureBudget = exposureBudget;
    return registry().publish(profile);
  };
  for (const [budget, field] of [[{ maxNudgesPerSession: 3 }, 'maxNudgesPerSession'], [{ minNudgeIntervalMs: 599_999 }, 'minNudgeIntervalMs'], [{ maxNudgesPerSession: 2, minNudgeIntervalMs: 0 }, 'minNudgeIntervalMs']] as const) {
    const diagnostic = diagnosticOf(exposureOf(budget));
    assert.equal(diagnostic?.code, 'profile.policy_violation');
    assert.equal(diagnostic?.field, field);
  }
  const effective = (budget: SiteProfile['momentRules']['exposureBudget']) => {
    const result = exposureOf(budget);
    assert.equal(result.ok, true);
    return result.ok ? result.active.exposure : undefined;
  };
  assert.deepEqual(effective(undefined), { maxNudgesPerSession: 2, minNudgeIntervalMs: 600_000, suppressAfterDismissal: true });
  assert.deepEqual(effective({ maxNudgesPerSession: 1 }), { maxNudgesPerSession: 1, minNudgeIntervalMs: 600_000, suppressAfterDismissal: true });
  assert.deepEqual(effective({ minNudgeIntervalMs: 900_000 }), { maxNudgesPerSession: 2, minNudgeIntervalMs: 900_000, suppressAfterDismissal: true });
  assert.deepEqual(effective({ maxNudgesPerSession: 0 }), { maxNudgesPerSession: 0, minNudgeIntervalMs: 600_000, suppressAfterDismissal: true });
  // The generic schema alone still accepts the weaker budget; only the policy rejects it.
  const weaker = clone(retailProfile) as SiteProfile;
  weaker.momentRules.exposureBudget = { maxNudgesPerSession: 5 };
  assert.equal(createProfileRegistry({ policy: { maxNudgesPerSession: 10, minNudgeIntervalMs: 0, suppressAfterDismissal: true } }).publish(weaker).ok, true);
});

test('published versions are immutable', () => {
  const r = registry();
  const input = clone(travelProfile) as SiteProfile;
  const result = r.publish(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  input.tenantId = 'changed-after-publish';
  assert.equal(result.active.profile.tenantId, 'tenant-wanderly-demo');
  assert.ok(Object.isFrozen(result.active.profile) && Object.isFrozen(result.active.profile.playbooks[0].starters[0].text));
  assert.throws(() => { (result.active.profile as { tenantId: string }).tenantId = 'x'; }, TypeError);

  const reordered = Object.fromEntries(Object.entries(clone(travelProfile)).reverse());
  assert.equal(r.publish(reordered).ok, true, 'identical content republishes idempotently');
  const changed = { ...clone(travelProfile), displayName: 'Changed' };
  assert.equal(diagnosticOf(r.publish(changed))?.code, 'profile.version_conflict');
  assert.equal(r.state().enabled, false);
  assert.equal(r.activate('wanderly', '1.0.0').ok, true);
  assert.equal(result.active.profile.displayName, 'Wanderly');
});

test('rollback restores the previous version, including after an invalid publish', () => {
  const r = registry();
  assert.equal(diagnosticOf(r.rollback())?.code, 'profile.rollback_unavailable');
  r.publish(withVersion(travelProfile, '1.0.0'));
  assert.equal(diagnosticOf(r.rollback())?.code, 'profile.rollback_unavailable');
  assert.equal(activeVersion(r), '1.0.0', 'unavailable rollback leaves the active version');
  r.publish(withVersion(travelProfile, '1.1.0'));
  assert.equal(activeVersion(r), '1.1.0');
  assert.equal(r.rollback().ok, true);
  assert.equal(activeVersion(r), '1.0.0');

  r.publish(withVersion(travelProfile, '1.2.0'));
  const bad = withVersion(travelProfile, '1.3.0');
  bad.momentRules.exposureBudget = { maxNudgesPerSession: 3 };
  assert.equal(diagnosticOf(r.publish(bad))?.code, 'profile.policy_violation');
  assert.equal(r.state().enabled, false);
  assert.equal(r.rollback().ok, true);
  assert.equal(activeVersion(r), '1.2.0');

  assert.equal(diagnosticOf(r.activate('wanderly', '9.9.9'))?.code, 'profile.version_not_found');
  assert.equal(activeVersion(r), '1.2.0');
  assert.equal(r.activate('wanderly', '1.1.0').ok, true);
  assert.equal(activeVersion(r), '1.1.0');
});

test('loader carries no site or domain vocabulary', () => {
  const source = readFileSync(new URL('loader.ts', import.meta.url), 'utf8');
  assert.equal(source.match(/\b(travel\w*|destination\w*|package\w*|booking\w*|hotel\w*|visa|trip\w*|flight\w*|budget|wanderly|volt|product\w*|checkout|laptop\w*|sku)\b/i)?.[0], undefined);
});
