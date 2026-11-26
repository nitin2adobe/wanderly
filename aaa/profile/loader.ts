import common from '../contracts/v1/common.schema.json' with { type: 'json' };
import siteProfileSchema from '../contracts/v1/site-profile.schema.json' with { type: 'json' };
import type { SiteProfile } from '../contracts/types.ts';
import { validateContract } from '../contracts/validate.ts';

// Site-agnostic Site Profile loader: frozen-schema validation, internal reference checks,
// a deployment exposure policy kept separate from the generic schema, and an immutable,
// versioned registry with rollback. A failed publish disables AAA; it never clamps or repairs.

export type ProfileDiagnosticCode =
  | 'profile.malformed'
  | 'contract.invalid'
  | 'profile.invalid_reference'
  | 'profile.policy_violation'
  | 'profile.version_conflict'
  | 'profile.version_not_found'
  | 'profile.rollback_unavailable';

// Bounded per the v1 diagnostic convention: no schema messages, instance values or host paths.
export type ProfileDiagnostic = {
  code: ProfileDiagnosticCode;
  correlationId: string;
  contract: 'SiteProfile';
  schemaId: string;
  schemaVersion: string;
  field?: string;
};

export type ExposurePolicy = Readonly<{
  maxNudgesPerSession: number;
  minNudgeIntervalMs: number;
  suppressAfterDismissal: true;
}>;

// D16 (user confirmed, demo deployment policy): profiles may only be stricter.
export const DEMO_EXPOSURE_POLICY: ExposurePolicy = Object.freeze({
  maxNudgesPerSession: 2,
  minNudgeIntervalMs: 600_000,
  suppressAfterDismissal: true,
});

export type ActiveProfile = Readonly<{ profile: Readonly<SiteProfile>; exposure: ExposurePolicy }>;

export type ProfileState = Readonly<
  | { enabled: true; active: ActiveProfile }
  | { enabled: false; diagnostic?: ProfileDiagnostic }
>;

export type ProfileFailure = { code: ProfileDiagnosticCode; field?: string };

const SCHEMA_ID = siteProfileSchema.$id;
const SCHEMA_VERSION = common.$defs.schemaVersion.const;
const TOP_LEVEL_FIELDS = new Set(Object.keys(siteProfileSchema.properties));
const EXPOSURE_FIELDS = new Set(['maxNudgesPerSession', 'minNudgeIntervalMs']);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Cross-object checks JSON Schema cannot express: declared IDs are unique and every reference resolves. */
export function checkReferences(profile: SiteProfile): ProfileFailure | undefined {
  const ids = (items: readonly { id: string }[]) => new Set(items.map(item => item.id));
  const unique = (list: readonly string[]) => new Set(list).size === list.length;
  const within = (refs: readonly string[] | undefined, declared: Set<string>) => (refs ?? []).every(ref => declared.has(ref));
  const { taxonomy } = profile;
  const pageTypes = ids(taxonomy.pageTypes);
  const funnelStages = ids(taxonomy.funnelStages);
  const entityTypes = ids(taxonomy.entityTypes);
  const topics = ids(taxonomy.topics);
  const facets = ids(profile.facets);
  const playbooks = ids(profile.playbooks);
  const evidence = new Set(profile.evidenceSet.entries.map(entry => entry.evidenceId));

  const checks: [string, boolean][] = [
    ['taxonomy', [taxonomy.pageTypes, taxonomy.entityTypes, taxonomy.funnelStages, taxonomy.topics].every(list => unique(list.map(item => item.id)))],
    ['facets', unique(profile.facets.map(facet => facet.id)) && profile.facets.every(facet => unique(facet.values.map(value => value.id)))],
    ['signalMap', unique(profile.signalMap.map(entry => entry.id))],
    ['playbooks', unique(profile.playbooks.map(playbook => playbook.id))],
    ['evidenceSet', unique(profile.evidenceSet.entries.map(entry => entry.evidenceId))],
    ['locales', profile.locales.supported.includes(profile.locales.default)],
    ['taxonomy', taxonomy.pageTypes.every(pageType => pageType.funnelStageId === undefined || funnelStages.has(pageType.funnelStageId))],
    ['momentRules', unique(profile.momentRules.rules.map(rule => rule.id))
      && within(profile.momentRules.derivedStates.inProgress.transactionPageTypes, pageTypes)
      && profile.momentRules.rules.every(rule => within(rule.when.pageTypes, pageTypes) && within(rule.playbookIds, playbooks))],
    ['playbooks', profile.playbooks.every(playbook => within(playbook.evidenceIds, evidence)
      && within(playbook.eligibility.pageTypes, pageTypes) && within(playbook.eligibility.entityTypes, entityTypes)
      && within(playbook.eligibility.facetIds, facets) && within(playbook.eligibility.topicIds, topics))],
    ['successEvent', profile.successEvent === undefined || within(profile.successEvent.pageTypes, pageTypes)],
  ];
  const failed = checks.find(([, ok]) => !ok);
  return failed ? { code: 'profile.invalid_reference', field: failed[0] } : undefined;
}

/** Applies a deployment exposure policy: weaker values are rejected, omitted values keep the policy limits. */
export function checkExposurePolicy(profile: SiteProfile, policy: ExposurePolicy): { exposure: ExposurePolicy } | ProfileFailure {
  const configured: { maxNudgesPerSession?: number; minNudgeIntervalMs?: number } = profile.momentRules.exposureBudget ?? {};
  if (configured.maxNudgesPerSession !== undefined && configured.maxNudgesPerSession > policy.maxNudgesPerSession) {
    return { code: 'profile.policy_violation', field: 'maxNudgesPerSession' };
  }
  if (configured.minNudgeIntervalMs !== undefined && configured.minNudgeIntervalMs < policy.minNudgeIntervalMs) {
    return { code: 'profile.policy_violation', field: 'minNudgeIntervalMs' };
  }
  // Dismissal suppression is not profile-configurable.
  return {
    exposure: Object.freeze({
      maxNudgesPerSession: configured.maxNudgesPerSession ?? policy.maxNudgesPerSession,
      minNudgeIntervalMs: configured.minNudgeIntervalMs ?? policy.minNudgeIntervalMs,
      suppressAfterDismissal: true,
    }),
  };
}

function fieldOf(path: string): string | undefined {
  const [first, second, third] = path.split('/').filter(Boolean);
  if (first === 'momentRules' && second === 'exposureBudget' && EXPOSURE_FIELDS.has(third)) return third;
  return TOP_LEVEL_FIELDS.has(first) ? first : undefined;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export type ProfileRegistryOptions = { policy: ExposurePolicy; createCorrelationId?: () => string };
export type ProfileResult = { ok: true; active: ActiveProfile } | { ok: false; diagnostic: ProfileDiagnostic };

export function createProfileRegistry({ policy, createCorrelationId = () => globalThis.crypto.randomUUID() }: ProfileRegistryOptions) {
  if (!Number.isSafeInteger(policy.maxNudgesPerSession) || policy.maxNudgesPerSession < 0
    || !Number.isSafeInteger(policy.minNudgeIntervalMs) || policy.minNudgeIntervalMs < 0
    || policy.suppressAfterDismissal !== true) {
    throw new TypeError('Invalid exposure policy');
  }
  const deploymentPolicy = Object.freeze({ ...policy });
  const versions = new Map<string, { json: string; active: ActiveProfile }>();
  const history: string[] = [];
  let state: ProfileState = Object.freeze({ enabled: false });
  const keyOf = (profileId: string, profileVersion: string) => JSON.stringify([profileId, profileVersion]);

  const fail = (failure: ProfileFailure, disable: boolean): ProfileResult => {
    if (disable) state = Object.freeze({ enabled: false });
    const correlationId = createCorrelationId();
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)) throw new TypeError('Invalid correlation ID');
    const diagnostic: ProfileDiagnostic = Object.freeze({
      code: failure.code, correlationId, contract: 'SiteProfile', schemaId: SCHEMA_ID, schemaVersion: SCHEMA_VERSION,
      ...(failure.field ? { field: failure.field } : {}),
    });
    if (disable) state = Object.freeze({ enabled: false, diagnostic });
    return { ok: false, diagnostic };
  };
  const activateKey = (key: string): ProfileResult => {
    const { active } = versions.get(key)!;
    if (history[history.length - 1] !== key) history.push(key);
    state = Object.freeze({ enabled: true, active });
    return { ok: true, active };
  };

  return {
    /** Validates, stores and activates a reviewed profile version (JSON text or a parsed value). Any failure disables AAA. */
    publish(input: unknown): ProfileResult {
      let value = input;
      if (typeof input === 'string') {
        try { value = JSON.parse(input); } catch { return fail({ code: 'profile.malformed' }, true); }
      }
      const validation = validateContract('SiteProfile', value);
      if (!validation.valid) return fail({ code: 'contract.invalid', field: fieldOf(validation.errors[0].path) }, true);
      const profile = validation.value;
      const reference = checkReferences(profile);
      if (reference) return fail(reference, true);
      const exposure = checkExposurePolicy(profile, deploymentPolicy);
      if (!('exposure' in exposure)) return fail(exposure, true);

      const key = keyOf(profile.profileId, profile.profileVersion);
      const json = canonicalJson(profile);
      const existing = versions.get(key);
      if (existing && existing.json !== json) return fail({ code: 'profile.version_conflict' }, true);
      if (!existing) versions.set(key, { json, active: deepFreeze({ profile: structuredClone(profile), exposure: exposure.exposure }) });
      return activateKey(key);
    },
    /** Re-activates an already published, immutable version. Unknown versions leave the current state unchanged. */
    activate(profileId: string, profileVersion: string): ProfileResult {
      const key = keyOf(profileId, profileVersion);
      return versions.has(key) ? activateKey(key) : fail({ code: 'profile.version_not_found' }, false);
    },
    /**
     * Restores the previous good version: after a failed publish, the last active version;
     * otherwise the version active before the current one. Leaves the state unchanged if none exists.
     */
    rollback(): ProfileResult {
      if (state.enabled ? history.length < 2 : history.length === 0) return fail({ code: 'profile.rollback_unavailable' }, false);
      if (state.enabled) history.pop();
      return activateKey(history[history.length - 1]);
    },
    state(): ProfileState { return state; },
    versions(): { profileId: string; profileVersion: string }[] {
      return [...versions.values()].map(({ active }) => ({ profileId: active.profile.profileId, profileVersion: active.profile.profileVersion }));
    },
  };
}
