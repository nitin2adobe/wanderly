import type { CanonicalSignal, JourneyState, SiteProfile, StarterRequest, StarterResult } from '../types.ts';

// Reference fixture 1 (travel). Illustrative demo data only; not a reviewed Wanderly profile (AAA-14).

const page = { pageInstanceId: 'pi-7f3a', pageRevision: 2, pageType: 'package-detail' };
const base = {
  schemaVersion: '1.0.0', sessionId: 's-travel-01', profileId: 'wanderly', profileVersion: '1.0.0',
  pageInstanceId: page.pageInstanceId, pageRevision: page.pageRevision, pageType: page.pageType, locale: 'en-US',
} as const;

export const travelSignals = [
  { ...base, signalId: 'sig-1', kind: 'page.viewed', seq: 1, ts: '2026-11-25T10:00:00Z', entityIds: [], provenance: 'explicit', source: 'track', attributes: { navigationType: 'navigate' } },
  { ...base, signalId: 'sig-2', kind: 'entity.viewed', seq: 2, ts: '2026-11-25T10:00:05Z', entityIds: ['pkg-bali-7n'], provenance: 'explicit', source: 'data-attribute', attributes: { entityType: 'package' } },
  { ...base, signalId: 'sig-3', kind: 'entity.compared', seq: 3, ts: '2026-11-25T10:01:00Z', entityIds: ['dest-bali', 'dest-maldives'], provenance: 'explicit', source: 'acdl', attributes: { entityType: 'destination' } },
  { ...base, signalId: 'sig-4', kind: 'facet.selected', seq: 4, ts: '2026-11-25T10:01:30Z', entityIds: [], provenance: 'explicit', source: 'track', attributes: { facetId: 'budget', valueIds: ['mid'] } },
  { ...base, signalId: 'sig-5', kind: 'info.sought', seq: 5, ts: '2026-11-25T10:02:00Z', entityIds: ['dest-bali'], provenance: 'inferred', source: 'data-attribute', attributes: { topicId: 'visa' } },
  { ...base, signalId: 'sig-6', kind: 'transaction.step', seq: 6, ts: '2026-11-25T10:03:00Z', entityIds: ['pkg-bali-7n'], provenance: 'explicit', source: 'track', attributes: { phase: 'start', flowId: 'booking', stepId: 'travellers' } },
] satisfies CanonicalSignal[];

export const travelJourney = {
  schemaVersion: '1.0.0', sessionId: base.sessionId, profileId: base.profileId, profileVersion: base.profileVersion,
  locale: 'en-US', updatedAt: '2026-11-25T10:02:00Z', lastSeq: 5, page,
  raw: { signals: travelSignals.slice(0, 5) },
  facets: [{ facetId: 'budget', valueIds: ['mid'], provenance: 'explicit', sourceSignalIds: ['sig-4'], updatedAt: '2026-11-25T10:01:30Z' }],
  derived: {
    hesitation: { status: 'active', provenance: 'inferred', since: '2026-11-25T10:02:00Z', basisSignalIds: ['sig-3', 'sig-5'], ruleId: 'compare-then-info' },
    inProgress: { status: 'inactive', provenance: 'inferred', basisSignalIds: [] },
  },
} satisfies JourneyState;

export const travelProfile = {
  schemaVersion: '1.0.0', profileId: 'wanderly', profileVersion: '1.0.0', tenantId: 'tenant-wanderly-demo', displayName: 'Wanderly',
  locales: { default: 'en-US', supported: ['en-US'] },
  taxonomy: {
    pageTypes: [
      { id: 'home', transactional: false, funnelStageId: 'discover' },
      { id: 'package-detail', transactional: false, funnelStageId: 'consider' },
      { id: 'booking', transactional: true, funnelStageId: 'convert' },
    ],
    entityTypes: [{ id: 'destination' }, { id: 'package' }],
    funnelStages: [{ id: 'discover' }, { id: 'consider' }, { id: 'convert' }],
    topics: [{ id: 'visa' }, { id: 'weather' }],
  },
  facets: [{ id: 'budget', values: [{ id: 'low' }, { id: 'mid' }, { id: 'high' }] }, { id: 'travellers', values: [{ id: 'solo' }, { id: 'couple' }, { id: 'family' }] }],
  signalMap: [
    { id: 'pv', source: 'track', match: 'page.viewed', kind: 'page.viewed', provenance: 'explicit' },
    { id: 'pkg-view', source: 'data-attribute', match: 'data-aaa-entity', kind: 'entity.viewed', provenance: 'explicit', fields: { entityIds: 'id', entityType: 'type' } },
    { id: 'compare', source: 'acdl', match: 'compare.view', kind: 'entity.compared', provenance: 'explicit', fields: { entityIds: 'eventInfo.ids', entityType: { value: 'destination' } } },
    { id: 'booking-step', source: 'track', match: 'booking.step', kind: 'transaction.step', provenance: 'explicit', fields: { phase: 'phase', stepId: 'step' } },
  ],
  momentRules: {
    derivedStates: {
      hesitation: { params: { minCompareCount: 1, minInfoSought: 1 } },
      inProgress: { transactionPageTypes: ['booking'] },
    },
    exposureBudget: { maxNudgesPerSession: 2, minNudgeIntervalMs: 600000 },
    rules: [{ id: 'compare-then-info', when: { pageTypes: ['package-detail'], derivedActive: ['hesitation'] }, decision: 'ASSIST', playbookIds: ['compare-help', 'visa-help', 'upgrade-offer'] }],
  },
  playbooks: [
    { id: 'compare-help', kind: 'helpful', evidenceIds: ['ev-bali'], eligibility: { entityTypes: ['destination'] }, starters: [{ templateId: 't-compare', role: 'primary', text: { 'en-US': 'How do these two destinations compare for my dates?' } }] },
    { id: 'visa-help', kind: 'helpful', evidenceIds: ['ev-visa'], eligibility: { topicIds: ['visa'] }, starters: [{ templateId: 't-visa', role: 'followup', text: { 'en-US': 'What entry requirements apply?' } }] },
    { id: 'upgrade-offer', kind: 'commercial', evidenceIds: ['ev-bali'], offerIds: ['offer-early-bird'], eligibility: { pageTypes: ['package-detail'] }, starters: [{ templateId: 't-offer', role: 'followup', text: { 'en-US': 'Is there an early booking offer for this package?' } }] },
  ],
  offerSource: { type: 'local-demo', catalogId: 'wanderly-offers' },
  evidenceSet: {
    evidenceSetId: 'wanderly-evidence', version: '1.0.0',
    entries: [
      { evidenceId: 'ev-bali', version: '1.0.0', summary: { 'en-US': 'Bali package facts.' }, entityIds: ['dest-bali', 'pkg-bali-7n'] },
      { evidenceId: 'ev-visa', version: '1.0.0', summary: { 'en-US': 'Entry requirement summary.' }, topicIds: ['visa'] },
    ],
  },
  contextMap: { maxChars: 600, fields: [{ key: 'pageType', from: 'page.pageType' }, { key: 'hesitating', from: 'derived.hesitation.status' }] },
  bcBinding: { datastreamId: 'demo-datastream', knowledgeIds: ['wanderly-kb'] },
} satisfies SiteProfile;

export const travelRequest = {
  schemaVersion: '1.0.0', requestId: 'req-travel-1', requestedAt: '2026-11-25T10:02:01Z', momentRuleId: 'compare-then-info', journey: travelJourney,
} satisfies StarterRequest;

export const travelResult = {
  schemaVersion: '1.0.0', requestId: 'req-travel-1', sessionId: base.sessionId, outcome: 'assist',
  profileId: 'wanderly', profileVersion: '1.0.0', locale: 'en-US', pageInstanceId: page.pageInstanceId, pageRevision: page.pageRevision,
  generatedAt: '2026-11-25T10:02:02Z', expiresAt: '2026-11-25T10:07:02Z', playbookId: 'compare-help',
  starters: [
    { starterId: 'st-1', role: 'primary', kind: 'helpful', text: 'How do Bali and the Maldives compare for my dates?', templateId: 't-compare' },
    { starterId: 'st-2', role: 'followup', kind: 'commercial', text: 'Is there an early booking offer for this package?', templateId: 't-offer', offerId: 'offer-early-bird' },
  ],
  evidenceIds: ['ev-bali'], offerIds: ['offer-early-bird'], reasonCodes: [],
} satisfies StarterResult;
