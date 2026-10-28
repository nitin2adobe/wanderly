import type { JourneyContext } from './journey-context.ts';
export { validateAssistanceDecision } from './assistance-schema.ts';

export type AssistanceDecision = 'SILENT' | 'WAIT' | 'ASSIST';
export type AssistanceType = 'NONE' | 'DESTINATION_COMPARISON' | 'PACKAGE_SELECTION' | 'TRAVEL_INFORMATION';

export type DecisionResult = {
  decision: AssistanceDecision;
  confidence: number;
  assistanceType: AssistanceType;
  headline: string;
  reason: string;
  evidence: string[];
};

const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 } as const;

/**
 * Step 3 baseline decision engine.
 * Deliberately deterministic and explainable so it can be used as the baseline
 * when we introduce an LLM reasoner. The policy defaults to silence and treats
 * forward booking progression as strong evidence that intervention is unnecessary.
 */
export function decideAssistance(c: JourneyContext): DecisionResult {
  const evidence: string[] = [];

  // Respect clear forward progress. This is our false-positive trap: comparison
  // activity alone should not trigger assistance once the visitor has progressed.
  if (c.journeyProgression === 'POSITIVE' || rank[c.bookingProgression] >= 1) {
    evidence.push('The visitor is progressing toward booking.');
    if (rank[c.comparisonActivity] >= 1) evidence.push('Comparison activity appears to have led to forward progress.');
    return {
      decision: 'SILENT', confidence: 0.93, assistanceType: 'NONE',
      headline: 'Let the journey continue',
      reason: 'Forward progression outweighs earlier signs of uncertainty, so proactive assistance would add interruption cost.',
      evidence
    };
  }

  // Explicit/repeated travel-information seeking is a strong assistance signal.
  if (c.potentialFriction === 'TRAVEL_INFORMATION' && rank[c.informationSeeking] >= 2) {
    evidence.push('Repeated travel-information activity detected.');
    return {
      decision: 'ASSIST', confidence: 0.90, assistanceType: 'TRAVEL_INFORMATION',
      headline: 'Offer travel-information help',
      reason: 'The visitor is repeatedly seeking travel information without clear forward progression.',
      evidence
    };
  }

  // Strong unresolved destination comparison: repeated switching, or heavy comparison activity.
  if (
    c.potentialFriction === 'DESTINATION_SELECTION' && rank[c.comparisonActivity] >= 1 &&
    (c.destinationSwitches >= 2 || c.comparisonActivity === 'HIGH')
  ) {
    evidence.push(c.destinationSwitches >= 2 ? `${c.destinationSwitches} destination switches detected.` : 'Repeated comparison actions detected.');
    evidence.push('The visitor used comparison content but has not progressed to booking.');
    return {
      decision: 'ASSIST', confidence: 0.88, assistanceType: 'DESTINATION_COMPARISON',
      headline: 'Offer destination comparison',
      reason: 'Repeated destination switching plus comparison activity suggests an unresolved selection decision.',
      evidence
    };
  }

  // Strong package/pricing exploration: comparison activity, or backtracking between packages.
  if (
    c.potentialFriction === 'PACKAGE_SELECTION' && rank[c.pricingExploration] >= 2 &&
    (rank[c.comparisonActivity] >= 1 || c.packageSwitches >= 2)
  ) {
    evidence.push('Repeated pricing exploration detected.');
    evidence.push(rank[c.comparisonActivity] >= 1 ? 'The visitor also used comparison content without booking progression.' : 'The visitor is backtracking between packages without booking progression.');
    return {
      decision: 'ASSIST', confidence: 0.84, assistanceType: 'PACKAGE_SELECTION',
      headline: 'Offer package-selection help',
      reason: 'Repeated price/package exploration plus comparison or package backtracking suggests the visitor may benefit from contextual help.',
      evidence
    };
  }

  // Early signals should not immediately create a popup. Wait for more evidence.
  if (
    c.potentialFriction !== 'NONE' ||
    c.packagesViewed.length >= 1 ||
    rank[c.destinationSwitching] >= 1 ||
    rank[c.comparisonActivity] >= 1 ||
    rank[c.pricingExploration] >= 1 ||
    rank[c.informationSeeking] >= 1
  ) {
    if (c.potentialFriction !== 'NONE') evidence.push(`Potential ${c.potentialFriction.toLowerCase().replaceAll('_', ' ')} signal detected.`);
    return {
      decision: 'WAIT', confidence: 0.72, assistanceType: 'NONE',
      headline: 'Gather more evidence',
      reason: 'There are early assistance signals, but not enough evidence to justify interrupting the visitor yet.',
      evidence
    };
  }

  return {
    decision: 'SILENT', confidence: 0.89, assistanceType: 'NONE',
    headline: 'No assistance needed',
    reason: 'The current journey does not show meaningful friction or information-seeking behavior.',
    evidence: ['No strong assistance signal is present.']
  };
}
