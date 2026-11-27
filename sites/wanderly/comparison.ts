import type { JourneyState, SiteProfile, StarterResult } from '../../aaa/contracts/types.ts';
import { getDestination } from '../../lib/data.ts';
export type ComparisonContext = { entityIds: string[]; evidence: { entityId: string; summary: string }[] };

/** Match only the live shortlist to the latest comparison on this page. */
export function comparisonContext(journey: JourneyState, profile: SiteProfile, selection: readonly string[], now = Date.now()): ComparisonContext {
  const empty = { entityIds: [], evidence: [] };
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
  return { entityIds: [...compared.entityIds], evidence };
}

export function comparisonSummary(comparison: ComparisonContext): string | undefined {
  if (comparison.entityIds.length !== 2 || comparison.evidence.length !== 2) return undefined;
  const facts = comparison.evidence.map(item => `${getDestination(item.entityId)?.name} (${item.entityId}): ${item.summary}`).join(' ');
  const summary = `Demo-approved comparison facts: ${facts}`;
  return summary.length <= 600 ? summary : undefined;
}

export function validateComparisonStarter(result: StarterResult, comparison: ComparisonContext): StarterResult | undefined {
  if (result.playbookId !== 'destination-compare') return result;
  if (comparison.entityIds.length !== 2 || comparison.evidence.length !== 2 || result.evidenceIds.length !== 2
    || !comparison.entityIds.every(id => result.evidenceIds.includes(`ev-destination-${id}`))) return undefined;
  return result;
}
