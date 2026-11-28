import type { JourneyState, SiteProfile, StarterResult } from '../../aaa/contracts/types.ts';
import { getDestination } from '../../lib/data.ts';
type ScopedEvidence = { entityId: string; evidenceId: string; summary: string };
export type ComparisonContext = {
  entityIds: string[];
  evidence: { entityId: string; summary: string }[];
  evidenceByPlaybook: Record<string, ScopedEvidence[]>;
};

/** Match only the live shortlist to the latest comparison on this page. */
export function comparisonContext(journey: JourneyState, profile: SiteProfile, selection: readonly string[], now = Date.now()): ComparisonContext {
  const empty: ComparisonContext = { entityIds: [], evidence: [], evidenceByPlaybook: {} };
  if (selection.length !== 2 || new Set(selection).size !== 2 || !selection.every(id => getDestination(id))) return empty;
  const signals = journey.raw.signals.filter(signal => signal.pageInstanceId === journey.page.pageInstanceId);
  const compared = signals.findLast(signal => signal.kind === 'entity.compared');
  if (!compared || compared.kind !== 'entity.compared' || compared.attributes.entityType !== 'destination'
    || compared.entityIds.length !== 2 || !selection.every(id => compared.entityIds.includes(id))
    || signals.some(signal => signal.kind === 'page.viewed' && signal.seq > compared.seq)) return empty;
  const evidence = compared.entityIds.flatMap(entityId => {
    const entry = profile.evidenceSet.entries.find(item => item.evidenceId === `ev-destination-${entityId}`
      && item.entityIds?.length === 1 && item.entityIds[0] === entityId && !item.topicIds?.length
      && (!item.validUntil || Date.parse(item.validUntil) > now));
    const summary = entry?.summary[journey.locale]?.trim();
    return summary ? [{ entityId, summary }] : [];
  });
  const evidenceByPlaybook: Record<string, ScopedEvidence[]> = {};
  for (const playbook of profile.playbooks) {
    evidenceByPlaybook[playbook.id] = compared.entityIds.flatMap(entityId => {
      const entries = profile.evidenceSet.entries.filter(entry => playbook.evidenceIds.includes(entry.evidenceId)
        && entry.entityIds?.length === 1 && entry.entityIds[0] === entityId
        && (!entry.validUntil || Date.parse(entry.validUntil) > now)
        && entry.summary[journey.locale]?.trim());
      return entries.map(entry => ({ entityId, evidenceId: entry.evidenceId, summary: entry.summary[journey.locale].trim() }));
    });
  }
  return { entityIds: [...compared.entityIds], evidence, evidenceByPlaybook };
}

export function comparisonSummary(comparison: ComparisonContext): string | undefined {
  if (comparison.entityIds.length !== 2 || comparison.evidence.length !== 2) return undefined;
  const facts = comparison.evidence.map(item => `${getDestination(item.entityId)?.name} (${item.entityId}): ${item.summary}`).join(' ');
  const summary = `Demo-approved comparison facts: ${facts}`;
  return summary.length <= 600 ? summary : undefined;
}

export function validateComparisonStarter(result: StarterResult, comparison: ComparisonContext): StarterResult | undefined {
  if (!result.playbookId || !['destination-compare', 'cost-focus', 'pace-fit'].includes(result.playbookId)) return result;
  if (result.playbookId === 'destination-compare') {
    if (comparison.entityIds.length !== 2 || comparison.evidence.length !== 2 || result.evidenceIds.length !== 2
      || !comparison.entityIds.every(id => result.evidenceIds.includes(`ev-destination-${id}`))) return undefined;
    return result;
  }
  const evidence = comparison.evidenceByPlaybook[result.playbookId] ?? [];
  if (comparison.entityIds.length !== 2 || result.evidenceIds.length !== 2
    || !comparison.entityIds.every(id => evidence.some(entry => entry.entityId === id && result.evidenceIds.includes(entry.evidenceId)))) return undefined;
  return result;
}
