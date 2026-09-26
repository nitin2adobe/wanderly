import type { AssistanceDecision, AssistanceType } from './assistance-decision.ts';
import type { JourneyContext } from './journey-context.ts';

export const signalLevels = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;
export const progressions = ['NEGATIVE', 'NEUTRAL', 'POSITIVE'] as const;
export const frictions = ['NONE', 'DESTINATION_SELECTION', 'PACKAGE_SELECTION', 'TRAVEL_INFORMATION'] as const;
export const assistanceDecisions = ['SILENT', 'WAIT', 'ASSIST'] as const;
export const assistanceTypes = ['NONE', 'DESTINATION_COMPARISON', 'PACKAGE_SELECTION', 'TRAVEL_INFORMATION'] as const;

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; errors: string[] };

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);

export function validateJourneyContext(value: unknown): ValidationResult<JourneyContext> {
  if (!value || typeof value !== 'object') return { valid: false, errors: ['JourneyContext must be an object.'] };
  const c = value as Partial<JourneyContext>;
  const errors: string[] = [];
  for (const key of ['destinationsViewed', 'packagesViewed', 'recentJourney'] as const) {
    if (!Array.isArray(c[key]) || c[key].some(item => typeof item !== 'string')) errors.push(`${key} must be a string array.`);
  }
  for (const key of ['destinationSwitches', 'semanticEventCount'] as const) {
    if (!Number.isInteger(c[key]) || (c[key] as number) < 0) errors.push(`${key} must be a non-negative integer.`);
  }
  for (const key of ['destinationSwitching', 'comparisonActivity', 'pricingExploration', 'informationSeeking', 'bookingProgression'] as const) {
    if (!isOneOf(c[key], signalLevels)) errors.push(`${key} must be a signal level.`);
  }
  if (!isOneOf(c.journeyProgression, progressions)) errors.push('journeyProgression must be a progression.');
  if (!isOneOf(c.potentialFriction, frictions)) errors.push('potentialFriction must be a friction type.');
  return errors.length ? { valid: false, errors } : { valid: true, value: c as JourneyContext };
}

export type AssistanceDecisionSchema = {
  decision: AssistanceDecision;
  confidence: number;
  assistanceType: AssistanceType;
  headline: string;
  reason: string;
  evidence: string[];
};

export function validateAssistanceDecision(value: unknown): ValidationResult<AssistanceDecisionSchema> {
  if (!value || typeof value !== 'object') return { valid: false, errors: ['AssistanceDecision must be an object.'] };
  const d = value as Partial<AssistanceDecisionSchema>;
  const errors: string[] = [];
  if (!isOneOf(d.decision, assistanceDecisions)) errors.push('decision must be SILENT, WAIT, or ASSIST.');
  if (typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) errors.push('confidence must be between 0 and 1.');
  if (!isOneOf(d.assistanceType, assistanceTypes)) errors.push('assistanceType must be a known assistance type.');
  for (const key of ['headline', 'reason'] as const) if (typeof d[key] !== 'string' || !d[key]?.trim()) errors.push(`${key} must be a non-empty string.`);
  if (!Array.isArray(d.evidence) || d.evidence.some(item => typeof item !== 'string' || !item.trim())) errors.push('evidence must be a string array.');
  return errors.length ? { valid: false, errors } : { valid: true, value: d as AssistanceDecisionSchema };
}
