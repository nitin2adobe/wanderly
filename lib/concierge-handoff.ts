import type { AssistanceType, DecisionResult } from './assistance-decision.ts';
import type { ValidationResult } from './assistance-schema.ts';
import type { JourneyContext } from './journey-context.ts';

const MAX_TEXT_LENGTH = 240;
const MAX_SIGNAL_LENGTH = 240;

export type ConciergeIntent = Exclude<AssistanceType, 'NONE'>;
export const conciergeIntents = ['DESTINATION_COMPARISON', 'PACKAGE_SELECTION', 'TRAVEL_INFORMATION'] as const;
export const conciergePriorities = ['BUDGET', 'ACTIVITIES', 'TRIP_LENGTH'] as const;
export type ConciergePriority = typeof conciergePriorities[number];

/**
 * Context passed from the activation plugin to the brand concierge.
 * `observedSignals` are facts seen in the journey; the concierge must not treat
 * them as conclusions about the visitor's state of mind.
 */
export type ConciergeHandoff = {
  version: 1;
  brand: string;
  intent: ConciergeIntent;
  entities: string[];
  observedSignals: string[];
  explicitPreferences: { priority?: ConciergePriority };
  entryPoint: 'proactive_invitation';
  sessionId: string;
  createdAt: string;
};

const unique = (items: string[], maxLength: number) => [...new Set(items.map(item => item.trim().slice(0, maxLength)).filter(Boolean))];

export function handoffEntities(intent: ConciergeIntent, context: JourneyContext): string[] {
  return unique(intent === 'PACKAGE_SELECTION' ? context.packagesViewed : context.destinationsViewed, MAX_TEXT_LENGTH);
}

export function buildHandoff(
  context: JourneyContext,
  decision: DecisionResult,
  sessionId: string,
  now: Date = new Date(),
  brand = 'wanderly',
  explicitPreferences: ConciergeHandoff['explicitPreferences'] = {},
): ConciergeHandoff {
  if (decision.decision !== 'ASSIST' || decision.assistanceType === 'NONE') {
    throw new Error('A concierge handoff requires an ASSIST decision with a specific assistance type.');
  }
  return {
    version: 1,
    brand,
    intent: decision.assistanceType,
    entities: handoffEntities(decision.assistanceType, context),
    observedSignals: unique(decision.evidence, MAX_SIGNAL_LENGTH),
    explicitPreferences: { ...explicitPreferences },
    entryPoint: 'proactive_invitation',
    sessionId,
    createdAt: now.toISOString(),
  };
}

const isStringArray = (value: unknown, maxLength: number): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim() !== '' && item.length <= maxLength);

export function validateHandoff(value: unknown): ValidationResult<ConciergeHandoff> {
  if (!value || typeof value !== 'object') return { valid: false, errors: ['ConciergeHandoff must be an object.'] };
  const h = value as Partial<ConciergeHandoff>;
  const errors: string[] = [];
  if (h.version !== 1) errors.push('version must be 1.');
  if (typeof h.brand !== 'string' || !h.brand.trim()) errors.push('brand must be a non-empty string.');
  if (!conciergeIntents.includes(h.intent as ConciergeIntent)) errors.push('intent must be a specific assistance type.');
  if (!isStringArray(h.entities, MAX_TEXT_LENGTH)) errors.push(`entities must be strings up to ${MAX_TEXT_LENGTH} characters.`);
  if (!isStringArray(h.observedSignals, MAX_SIGNAL_LENGTH)) errors.push(`observedSignals must be strings up to ${MAX_SIGNAL_LENGTH} characters.`);
  if (h.entryPoint !== 'proactive_invitation') errors.push('entryPoint must be "proactive_invitation".');
  if (typeof h.sessionId !== 'string' || !h.sessionId) errors.push('sessionId must be a non-empty string.');
  if (typeof h.createdAt !== 'string' || Number.isNaN(Date.parse(h.createdAt))) errors.push('createdAt must be an ISO timestamp.');
  const prefs = h.explicitPreferences;
  if (!prefs || typeof prefs !== 'object') errors.push('explicitPreferences must be an object.');
  else if (prefs.priority !== undefined && !conciergePriorities.includes(prefs.priority)) errors.push('explicitPreferences.priority is not a known priority.');
  return errors.length ? { valid: false, errors } : { valid: true, value: h as ConciergeHandoff };
}
