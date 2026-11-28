import type { CanonicalSignal, JourneyState, SiteProfile, StarterRequest, StarterResult } from '../../aaa/contracts/types.ts';

// Non-travel fixture (retail, Volt Electronics). Illustrative demo data only; not the AAA-15 profile.

const page = { pageInstanceId: 'pi-c09e', pageRevision: 0, pageType: 'product' };
const base = {
  schemaVersion: '1.0.0', sessionId: 's-retail-01', profileId: 'volt-electronics', profileVersion: '2.1.0',
  pageInstanceId: page.pageInstanceId, pageRevision: page.pageRevision, pageType: page.pageType, locale: 'de-DE',
} as const;

export const retailSignals = [
  { ...base, signalId: 'v-1', kind: 'page.viewed', seq: 10, ts: '2026-11-25T12:00:00Z', entityIds: [], provenance: 'explicit', source: 'acdl', attributes: { navigationType: 'back_forward' } },
  { ...base, signalId: 'v-2', kind: 'entity.compared', seq: 11, ts: '2026-11-25T12:00:40Z', entityIds: ['sku-LAP-14', 'sku-LAP-16'], provenance: 'explicit', source: 'acdl', attributes: { entityType: 'product' } },
  { ...base, signalId: 'v-3', kind: 'facet.selected', seq: 12, ts: '2026-11-25T12:01:00Z', entityIds: [], provenance: 'explicit', source: 'data-attribute', attributes: { facetId: 'brand', valueIds: ['volt', 'nordic'] } },
  { ...base, signalId: 'v-4', kind: 'info.sought', seq: 13, ts: '2026-11-25T12:01:30Z', entityIds: ['sku-LAP-14'], provenance: 'explicit', source: 'track', attributes: { topicId: 'returns' } },
] satisfies CanonicalSignal[];

export const retailJourney = {
  schemaVersion: '1.0.0', sessionId: base.sessionId, profileId: base.profileId, profileVersion: base.profileVersion,
  locale: 'de-DE', updatedAt: '2026-11-25T12:01:30Z', lastSeq: 13, page,
  raw: { signals: retailSignals },
  facets: [
    { facetId: 'brand', valueIds: ['volt', 'nordic'], provenance: 'explicit', sourceSignalIds: ['v-3'], updatedAt: '2026-11-25T12:01:00Z' },
    { facetId: 'priority', valueIds: ['warranty'], provenance: 'inferred', sourceSignalIds: ['v-4'], updatedAt: '2026-11-25T12:01:30Z' },
  ],
  derived: {
    hesitation: { status: 'uncertain', provenance: 'inferred', basisSignalIds: ['v-2'] },
    inProgress: { status: 'inactive', provenance: 'inferred', basisSignalIds: [] },
  },
} satisfies JourneyState;

export const retailProfile = {
  schemaVersion: '1.0.0', profileId: 'volt-electronics', profileVersion: '2.1.0', tenantId: 'tenant-volt-demo',
  locales: { default: 'en-GB', supported: ['en-GB', 'de-DE'] },
  taxonomy: {
    pageTypes: [{ id: 'listing', transactional: false }, { id: 'product', transactional: false }, { id: 'checkout', transactional: true }],
    entityTypes: [{ id: 'product', label: { 'en-GB': 'Product', 'de-DE': 'Produkt' } }],
    funnelStages: [],
    topics: [{ id: 'returns' }, { id: 'specs' }],
  },
  facets: [{ id: 'brand', values: [{ id: 'volt' }, { id: 'nordic' }] }, { id: 'priority', values: [{ id: 'warranty' }, { id: 'price' }] }],
  signalMap: [
    { id: 'acdl-page', source: 'acdl', match: 'page:loaded', kind: 'page.viewed', provenance: 'explicit' },
    { id: 'acdl-compare', source: 'acdl', match: 'compare:opened', kind: 'entity.compared', provenance: 'explicit', fields: { entityIds: 'skus', entityType: { value: 'product' } } },
    { id: 'checkout', source: 'acdl', match: 'checkout:step', kind: 'transaction.step', provenance: 'explicit', fields: { phase: 'phase' } },
  ],
  momentRules: {
    derivedStates: {
      hesitation: { params: { minCompareCount: 2, dwellMs: 45000 } },
      inProgress: { transactionPageTypes: ['checkout'] },
    },
    rules: [{ id: 'compare-returns', when: { signalKinds: ['entity.compared', 'info.sought'] }, decision: 'ASSIST', playbookIds: ['returns-help'] }],
  },
  playbooks: [
    { id: 'returns-help', kind: 'helpful', evidenceIds: ['ev-returns'], eligibility: { topicIds: ['returns'] }, starters: [
      { templateId: 't-returns', role: 'primary', text: { 'en-GB': 'What is the returns policy for these laptops?', 'de-DE': 'Wie lauten die Rückgabebedingungen für diese Laptops?' } },
    ] },
  ],
  offerSource: { type: 'local-demo', catalogId: 'volt-offers' },
  evidenceSet: { evidenceSetId: 'volt-evidence', version: '3.0.0', entries: [{ evidenceId: 'ev-returns', version: '1.2.0', summary: { 'en-GB': 'Returns policy.' }, topicIds: ['returns'], validUntil: '2027-01-01T00:00:00Z' }] },
  contextMap: { maxChars: 400, fields: [{ key: 'pageType', from: 'page.pageType' }, { key: 'priorities', from: 'facets', maxChars: 120 }] },
  bcBinding: { datastreamId: 'volt-datastream', instanceId: 'volt-bc', stylingId: 'volt-theme' },
  successEvent: { id: 'order-placed', signalKind: 'transaction.step', pageTypes: ['checkout'], transactionPhase: 'complete' },
} satisfies SiteProfile;

export const retailRequest = { schemaVersion: '1.0.0', requestId: 'req-volt-1', requestedAt: '2026-11-25T12:01:31Z', journey: retailJourney } satisfies StarterRequest;

const resultBase = {
  schemaVersion: '1.0.0', requestId: 'req-volt-1', sessionId: base.sessionId, profileId: base.profileId, profileVersion: base.profileVersion,
  locale: 'de-DE', pageInstanceId: page.pageInstanceId, pageRevision: page.pageRevision,
  generatedAt: '2026-11-25T12:01:32Z', expiresAt: '2026-11-25T12:06:32Z',
} as const;

export const retailFallbackResult = {
  ...resultBase, outcome: 'fallback', playbookId: 'returns-help',
  starters: [{ starterId: 'st-r1', role: 'primary', kind: 'helpful', text: 'Wie lauten die Rückgabebedingungen für diese Laptops?', templateId: 't-returns' }],
  evidenceIds: ['ev-returns'], offerIds: [], reasonCodes: ['model.timeout'],
} satisfies StarterResult;

export const retailAbstainResult = {
  ...resultBase, outcome: 'abstain', playbookId: null, starters: [], evidenceIds: [], offerIds: [], reasonCodes: ['evidence.missing'],
} satisfies StarterResult;
