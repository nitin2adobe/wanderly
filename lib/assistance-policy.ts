import type { AssistanceType, DecisionResult } from './assistance-decision.ts';
import { deriveMemory } from './assistance-memory.ts';
import type { WanderlyEvent } from './events.ts';
import type { JourneyContext } from './journey-context.ts';

const MAX_VISITOR_DISMISSALS = 2;

export type PolicyRule =
  | 'NOT_ASSIST' | 'LOW_CONFIDENCE' | 'FORWARD_PROGRESS' | 'INVITATION_PENDING'
  | 'REPEATED_DISMISSALS' | 'TYPE_ALREADY_HANDLED' | 'COOLDOWN' | 'SESSION_BUDGET' | 'ALLOWED';

export type PolicyResult = { allowed: boolean; rule: PolicyRule; reason: string };

export type PolicyOptions = {
  minConfidence: number;
  maxInvitationsPerSession: number;
  cooldownMs: number;
};

export const defaultPolicy: PolicyOptions = { minConfidence: 0.8, maxInvitationsPerSession: 2, cooldownMs: 120_000 };

const assistanceEvents = (events: WanderlyEvent[]) =>
  events.filter(e => e.eventType === 'ASSISTANCE_SHOWN' || e.eventType === 'ASSISTANCE_ACCEPTED' || e.eventType === 'ASSISTANCE_DISMISSED');
const typeOf = (e: WanderlyEvent) => e.metadata?.assistanceType as AssistanceType | undefined;

/** True when the latest invitation has been shown but not yet accepted or dismissed. */
export function hasPendingInvitation(sessionEvents: WanderlyEvent[]): boolean {
  const last = assistanceEvents(sessionEvents).at(-1);
  return last?.eventType === 'ASSISTANCE_SHOWN';
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
  // The plugin adapts to what the visitor has told it: repeated "not now" means stop, not retry later.
  const { visitorDismissals } = deriveMemory(sessionEvents);
  if (visitorDismissals >= MAX_VISITOR_DISMISSALS) {
    return block('REPEATED_DISMISSALS', `The visitor dismissed ${visitorDismissals} invitations; no further invitations this session.`);
  }
  if (history.some(e => e.eventType !== 'ASSISTANCE_SHOWN' && typeOf(e) === decision.assistanceType)) {
    return block('TYPE_ALREADY_HANDLED', `The visitor already responded to ${decision.assistanceType} assistance this session.`);
  }
  const lastDismissal = history.filter(e => e.eventType === 'ASSISTANCE_DISMISSED').at(-1);
  if (lastDismissal) {
    // Each visitor dismissal doubles the wait before the next invitation.
    const cooldownMs = options.cooldownMs * 2 ** Math.max(0, visitorDismissals - 1);
    const elapsed = now.getTime() - Date.parse(lastDismissal.timestamp);
    if (elapsed < cooldownMs) {
      return block('COOLDOWN', `Cooling down after a dismissal (${Math.ceil((cooldownMs - elapsed) / 1000)}s remaining).`);
    }
  }
  if (history.filter(e => e.eventType === 'ASSISTANCE_SHOWN').length >= options.maxInvitationsPerSession) {
    return block('SESSION_BUDGET', `Session invitation budget (${options.maxInvitationsPerSession}) is used.`);
  }
  return { allowed: true, rule: 'ALLOWED', reason: 'All policy checks passed.' };
}
