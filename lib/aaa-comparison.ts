import type { JourneyState, SiteProfile, StarterRequest } from '../aaa/contracts/types.ts';
import type { SuppressionResult } from '../aaa/suppression.ts';
import type { AmbientPage } from './ambient-context.ts';

export const COMPARISON_SNAPSHOT_REQUEST = 'aaa:comparison-snapshot';
export type ComparisonSnapshot = {
  request?: StarterRequest;
  page: AmbientPage;
  selection: string[];
};

export function comparisonRequest(input: {
  journey?: JourneyState;
  profile?: Readonly<SiteProfile>;
  moment?: { id: string; decision: string };
  suppression: SuppressionResult;
}, requestId: string, requestedAt: string): StarterRequest | undefined {
  const { journey, profile, moment, suppression } = input;
  if (!journey || !profile || !moment || moment.decision !== 'ASSIST'
    || journey.profileId !== profile.profileId || journey.profileVersion !== profile.profileVersion
    || (!suppression.allowed && suppression.reasonCodes.length === 0)
    || suppression.reasonCodes.some(reason => !reason.startsWith('exposure.'))) return;
  return { schemaVersion: '1.0.0', requestId, requestedAt, journey, momentRuleId: moment.id };
}
