import type { AssistanceType, DecisionResult } from './assistance-decision.ts';
import { deriveMemory } from './assistance-memory.ts';
import type { WanderlyEvent } from './events.ts';
import type { JourneyContext } from './journey-context.ts';
import { evaluateCurrentSuppression } from '../sites/wanderly/aaa.ts';

const MAX_VISITOR_DISMISSALS = 1;

export type PolicyRule =
  | 'NOT_ASSIST' | 'LOW_CONFIDENCE' | 'FORWARD_PROGRESS' | 'INVITATION_PENDING'
  | 'REPEATED_DISMISSALS' | 'TYPE_ALREADY_HANDLED' | 'COOLDOWN' | 'SESSION_BUDGET' | 'INVALID_POLICY' | 'AAA_SUPPRESSED' | 'ALLOWED';

export type PolicyResult = { allowed: boolean; rule: PolicyRule; reason: string };

export type PolicyOptions = {
  minConfidence: number;
  maxInvitationsPerSession: number;
  cooldownMs: number;
};

export const defaultPolicy: PolicyOptions = { minConfidence: 0.8, maxInvitationsPerSession: 2, cooldownMs: 600_000 };

const assistanceEvents = (events: WanderlyEvent[]) =>
  events.filter(e => ['ASSISTANCE_SHOWN', 'ASSISTANCE_TRIGGERED', 'ASSISTANCE_ACCEPTED', 'ASSISTANCE_DISMISSED', 'ASSISTANCE_REQUESTED', 'ASSISTANCE_OPENED', 'ASSISTANCE_FAILED', 'ASSISTANCE_CANCELLED'].includes(e.eventType));
const typeOf = (e: WanderlyEvent) => e.metadata?.assistanceType as AssistanceType | undefined;

/** True when the latest invitation has been shown but not yet accepted or dismissed. */
export function hasPendingInvitation(sessionEvents: WanderlyEvent[]): boolean {
  const last = assistanceEvents(sessionEvents).at(-1);
  return last?.eventType === 'ASSISTANCE_SHOWN' || last?.eventType === 'ASSISTANCE_REQUESTED';
}

/** True when the visitor is already progressing toward booking, regardless of who proposed the invitation. */
export function isForwardProgress(context: JourneyContext): boolean {
  return context.journeyProgression === 'POSITIVE' || context.bookingProgression !== 'NONE';
}

/**
 * Deterministic gate between a model/rule proposal and anything the visitor sees.
 * `sessionEvents` must contain only the current session's events, oldest first.
 */
export function evaluatePolicy(
  decision: Pick<DecisionResult, 'decision' | 'confidence' | 'assistanceType'>,
  context: JourneyContext,
  sessionEvents: WanderlyEvent[],
  now: Date = new Date(),
  options: PolicyOptions = defaultPolicy,
): PolicyResult {
  const block = (rule: PolicyRule, reason: string): PolicyResult => ({ allowed: false, rule, reason });
  if (!Number.isSafeInteger(options.maxInvitationsPerSession) || options.maxInvitationsPerSession < 0 || options.maxInvitationsPerSession > 2
    || !Number.isSafeInteger(options.cooldownMs) || options.cooldownMs < 600_000
    || !Number.isFinite(options.minConfidence) || options.minConfidence < 0 || options.minConfidence > 1) {
    return block('INVALID_POLICY', 'profile.policy_violation');
  }
  if (typeof window !== 'undefined') {
    const suppression = evaluateCurrentSuppression();
    if (!suppression.allowed) return block('AAA_SUPPRESSED', suppression.reasonCodes.join(','));
  }

  if (decision.decision !== 'ASSIST' || decision.assistanceType === 'NONE') {
    return block('NOT_ASSIST', `Decision is ${decision.decision}; only ASSIST can produce an invitation.`);
  }
  if (decision.confidence < options.minConfidence) {
    return block('LOW_CONFIDENCE', `Confidence ${decision.confidence} is below the ${options.minConfidence} threshold.`);
  }
  if (isForwardProgress(context)) {
    return block('FORWARD_PROGRESS', 'The visitor is progressing toward booking; do not interrupt.');
  }

  const history = assistanceEvents(sessionEvents);
  if (hasPendingInvitation(sessionEvents)) {
    return block('INVITATION_PENDING', 'An invitation is already visible.');
  }
  // One visitor dismissal suppresses the rest of the session (D16).
  const { visitorDismissals } = deriveMemory(sessionEvents);
  if (visitorDismissals >= MAX_VISITOR_DISMISSALS) {
    return block('REPEATED_DISMISSALS', `The visitor dismissed ${visitorDismissals} invitations; no further invitations this session.`);
  }
  if (history.some(e => ['ASSISTANCE_OPENED', 'ASSISTANCE_TRIGGERED', 'ASSISTANCE_ACCEPTED', 'ASSISTANCE_DISMISSED'].includes(e.eventType) && typeOf(e) === decision.assistanceType)) {
    return block('TYPE_ALREADY_HANDLED', `${decision.assistanceType} assistance was already handled this session.`);
  }
  if (history.filter(e => e.eventType === 'ASSISTANCE_SHOWN').length >= options.maxInvitationsPerSession) {
    return block('SESSION_BUDGET', `Session invitation budget (${options.maxInvitationsPerSession}) is used.`);
  }
  const lastShown = history.filter(e => e.eventType === 'ASSISTANCE_SHOWN').at(-1);
  if (lastShown) {
    const elapsed = now.getTime() - Date.parse(lastShown.timestamp);
    if (!Number.isFinite(elapsed) || elapsed < options.cooldownMs) {
      return block('COOLDOWN', 'exposure.cooldown');
    }
  }
  return { allowed: true, rule: 'ALLOWED', reason: 'All policy checks passed.' };
}
