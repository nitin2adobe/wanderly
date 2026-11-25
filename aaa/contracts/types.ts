// TypeScript mirror of the AAA v1 JSON Schemas in ./v1. The schemas are the source of truth;
// contracts.test.ts checks that the enum tuples below match them.

export const CONTRACT_SCHEMA_VERSION = '1.0.0' as const;
export const rawSignalKinds = ['page.viewed', 'entity.viewed', 'entity.compared', 'info.sought', 'facet.selected', 'transaction.step'] as const;
export const derivedStateKinds = ['hesitation', 'inProgress'] as const;
export const provenances = ['explicit', 'inferred'] as const;
export const signalSources = ['track', 'data-attribute', 'acdl'] as const;
export const transactionPhases = ['start', 'step', 'complete'] as const;
export const momentDecisions = ['SILENT', 'WAIT', 'ASSIST'] as const;
export const starterOutcomes = ['assist', 'abstain', 'fallback'] as const;

export type SchemaVersion = typeof CONTRACT_SCHEMA_VERSION;
export type Id = string;
export type Version = string;
export type Timestamp = string;
export type Locale = string;
export type ReasonCode = string;
export type LocalizedText = Record<Locale, string>;
export type RawSignalKind = (typeof rawSignalKinds)[number];
export type DerivedStateKind = (typeof derivedStateKinds)[number];
export type Provenance = (typeof provenances)[number];
export type SignalSource = (typeof signalSources)[number];
export type TransactionPhase = (typeof transactionPhases)[number];
export type MomentDecision = (typeof momentDecisions)[number];
export type StarterOutcome = (typeof starterOutcomes)[number];

export type PageRef = { pageInstanceId: Id; pageRevision: number; pageType: Id };

type SignalBase<K extends RawSignalKind, A> = {
  schemaVersion: SchemaVersion;
  signalId: Id;
  kind: K;
  sessionId: Id;
  seq: number;
  ts: Timestamp;
  profileId: Id;
  profileVersion: Version;
  pageInstanceId: Id;
  pageRevision: number;
  pageType: Id;
  locale: Locale;
  entityIds: Id[];
  provenance: Provenance;
  source?: SignalSource;
  attributes: A;
};

export type CanonicalSignal =
  | SignalBase<'page.viewed', { navigationType?: 'navigate' | 'reload' | 'back_forward' | 'spa' }>
  | SignalBase<'entity.viewed', { entityType: Id }>
  | SignalBase<'entity.compared', { entityType: Id }>
  | SignalBase<'info.sought', { topicId: Id }>
  | SignalBase<'facet.selected', { facetId: Id; valueIds: Id[] }>
  | SignalBase<'transaction.step', { phase: TransactionPhase; flowId?: Id; stepId?: Id }>;

export type FacetState = { facetId: Id; valueIds: Id[]; provenance: Provenance; sourceSignalIds: Id[]; updatedAt: Timestamp };
export type DerivedState = {
  status: 'active' | 'inactive' | 'uncertain';
  provenance: 'inferred';
  since?: Timestamp;
  basisSignalIds: Id[];
  ruleId?: Id;
};

export type JourneyState = {
  schemaVersion: SchemaVersion;
  sessionId: Id;
  profileId: Id;
  profileVersion: Version;
  locale: Locale;
  updatedAt: Timestamp;
  lastSeq: number;
  page: PageRef;
  raw: { signals: CanonicalSignal[] };
  facets: FacetState[];
  derived: Record<DerivedStateKind, DerivedState>;
};

type TaxonomyEntry = { id: Id; label?: LocalizedText };
type FieldPath = string;

export type SiteProfile = {
  schemaVersion: SchemaVersion;
  profileId: Id;
  profileVersion: Version;
  tenantId: Id;
  displayName?: string;
  locales: { default: Locale; supported: Locale[] };
  taxonomy: {
    pageTypes: (TaxonomyEntry & { funnelStageId?: Id; transactional: boolean })[];
    entityTypes: TaxonomyEntry[];
    funnelStages: TaxonomyEntry[];
    topics: TaxonomyEntry[];
  };
  facets: (TaxonomyEntry & { values: TaxonomyEntry[] })[];
  signalMap: {
    id: Id;
    source: SignalSource;
    match: string;
    kind: RawSignalKind;
    provenance: Provenance;
    fields?: Partial<Record<'entityIds' | 'entityType' | 'topicId' | 'facetId' | 'valueIds' | 'phase' | 'flowId' | 'stepId', FieldPath>>;
  }[];
  momentRules: {
    derivedStates: {
      hesitation: { params: Record<string, number> };
      inProgress: { transactionPageTypes: Id[]; idleTimeoutMs: number };
    };
    rules: {
      id: Id;
      when: { pageTypes?: Id[]; signalKinds?: RawSignalKind[]; derivedActive?: DerivedStateKind[] };
      decision: MomentDecision;
      playbookIds?: Id[];
    }[];
  };
  playbooks: {
    id: Id;
    kind: 'helpful' | 'commercial';
    evidenceIds: Id[];
    offerIds?: Id[];
    eligibility: { pageTypes?: Id[]; entityTypes?: Id[]; facetIds?: Id[]; topicIds?: Id[] };
    starters: { templateId: Id; role: 'primary' | 'followup'; text: LocalizedText }[];
  }[];
  offerSource: { type: Id; catalogId: Id };
  evidenceSet: {
    evidenceSetId: Id;
    version: Version;
    entries: { evidenceId: Id; version: Version; summary: LocalizedText; entityIds?: Id[]; topicIds?: Id[]; validUntil?: Timestamp }[];
  };
  contextMap: { maxChars: number; fields: { key: Id; from: string; maxChars?: number }[] };
  bcBinding: { datastreamId: Id; instanceId?: Id; knowledgeIds?: Id[]; stylingId?: Id };
  successEvent: { id: Id; signalKind: RawSignalKind; pageTypes?: Id[]; transactionPhase?: TransactionPhase };
};

export type StarterRequest = {
  schemaVersion: SchemaVersion;
  requestId: Id;
  requestedAt: Timestamp;
  momentRuleId?: Id;
  journey: JourneyState;
};

export type Starter = { starterId: Id; role: 'primary' | 'followup'; kind: 'helpful' | 'commercial'; text: string; templateId?: Id };

export type StarterResult = {
  schemaVersion: SchemaVersion;
  requestId: Id;
  sessionId: Id;
  outcome: StarterOutcome;
  profileId: Id;
  profileVersion: Version;
  locale: Locale;
  pageInstanceId: Id;
  pageRevision: number;
  generatedAt: Timestamp;
  expiresAt: Timestamp;
  playbookId: Id | null;
  starters: Starter[];
  evidenceIds: Id[];
  offerIds: Id[];
  reasonCodes: ReasonCode[];
};
