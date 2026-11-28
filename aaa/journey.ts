import type { CanonicalSignal, DerivedState, JourneyState, PageRef, SiteProfile } from './contracts/types.ts';

type DerivationOptions = {
  now: number;
  page: PageRef;
  terminalConfirmed?: (signal: CanonicalSignal) => boolean;
  incomplete?: boolean;
};
const derived = (status: DerivedState['status'], basisSignalIds: string[], ruleId: string): DerivedState => ({
  status, provenance: 'inferred', basisSignalIds, ruleId,
});

/** Replays raw observations; page exit and elapsed time never confirm an operation ended. */
export function deriveJourney(profile: SiteProfile, signals: readonly CanonicalSignal[], options: DerivationOptions): JourneyState | undefined {
  const last = signals.at(-1);
  if (!last) return undefined;
  const raw = signals.filter(signal => signal.sessionId === last.sessionId
    && signal.profileId === profile.profileId && signal.profileVersion === profile.profileVersion);
  const transactions = new Map<string, CanonicalSignal>();
  const unknown = new Map<string, CanonicalSignal>();
  const facets = new Map<string, JourneyState['facets'][number]>();
  let pageUncertain = false;
  let latestTransaction: CanonicalSignal | undefined;
  for (const signal of raw) {
    if (signal.kind === 'page.viewed' && profile.momentRules.derivedStates.inProgress.transactionPageTypes.includes(signal.pageType)) pageUncertain = true;
    if (signal.kind === 'facet.selected') {
      facets.set(signal.attributes.facetId, {
        facetId: signal.attributes.facetId, valueIds: signal.attributes.valueIds, provenance: signal.provenance,
        sourceSignalIds: [signal.signalId], updatedAt: signal.ts,
      });
    }
    if (signal.kind !== 'transaction.step') continue;
    latestTransaction = signal;
    const key = signal.attributes.flowId ?? 'unidentified';
    const terminal = signal.attributes.phase === 'complete' || signal.attributes.phase === 'cancel';
    if (!terminal) {
      if (signal.attributes.flowId) { transactions.set(key, signal); pageUncertain = false; }
      else unknown.set(key, signal);
    } else if (signal.attributes.flowId && transactions.has(key) && options.terminalConfirmed?.(signal)) {
      transactions.delete(key);
      unknown.delete(key);
      pageUncertain = false;
    } else unknown.set(key, signal);
  }
  const transactionBasis = [...transactions.values(), ...unknown.values()].map(signal => signal.signalId);
  const idleTimeout = profile.momentRules.derivedStates.inProgress.idleTimeoutMs;
  const idle = transactions.size > 0 && idleTimeout !== undefined && latestTransaction !== undefined
    && options.now - Date.parse(latestTransaction.ts) >= idleTimeout;
  const inProgress = derived(
    options.incomplete || unknown.size || pageUncertain || idle ? 'uncertain' : transactions.size ? 'active' : 'inactive',
    transactionBasis, 'transaction-lifecycle',
  );
  const params = profile.momentRules.derivedStates.hesitation.params;
  const counts: Record<string, number> = {
    minCompareCount: raw.filter(signal => signal.kind === 'entity.compared').length,
    minInfoSought: raw.filter(signal => signal.kind === 'info.sought').length,
    minEntitySwitches: 0,
    minSignals: raw.length,
    dwellMs: Math.max(0, options.now - Date.parse(raw.filter(signal => signal.kind === 'page.viewed'
      && signal.pageInstanceId === options.page.pageInstanceId && signal.pageType === options.page.pageType).at(-1)?.ts ?? new Date(options.now).toISOString())),
  };
  let previous: string | undefined;
  for (const signal of raw) if (signal.kind === 'entity.viewed') {
    const next = `${signal.attributes.entityType}:${signal.entityIds.join(',')}`;
    if (previous !== undefined && previous !== next) counts.minEntitySwitches++;
    previous = next;
  }
  const thresholds = Object.entries(params);
  const thresholdsValid = thresholds.length > 0 && thresholds.every(([key, value]) => Object.hasOwn(counts, key) && Number.isSafeInteger(value) && value >= 1);
  const hesitation = derived(options.incomplete || !thresholdsValid ? 'uncertain'
    : thresholds.every(([key, value]) => counts[key] >= value) ? 'active' : 'inactive',
  raw.filter(signal => ['entity.viewed', 'entity.compared', 'info.sought'].includes(signal.kind)).map(signal => signal.signalId),
  'profile-hesitation');
  return {
    schemaVersion: '1.0.0', sessionId: last.sessionId, profileId: profile.profileId, profileVersion: profile.profileVersion,
    locale: last.locale, updatedAt: new Date(options.now).toISOString(), lastSeq: last.seq,
    page: { pageInstanceId: options.page.pageInstanceId, pageRevision: options.page.pageRevision, pageType: options.page.pageType },
    raw: { signals: [...raw] }, facets: [...facets.values()], derived: { hesitation, inProgress },
  };
}

export function matchMoment(profile: SiteProfile, journey: JourneyState) {
  return profile.momentRules.rules.find(rule =>
    (!rule.when.pageTypes || rule.when.pageTypes.includes(journey.page.pageType))
    && (!rule.when.signalKinds || rule.when.signalKinds.every(kind => journey.raw.signals.some(signal => signal.kind === kind)))
    && (!rule.when.derivedActive || rule.when.derivedActive.every(kind => journey.derived[kind].status === 'active')));
}
