import { decideAssistance, type AssistanceDecision, type AssistanceType } from './assistance-decision.ts';
import { evaluatePolicy, type PolicyOptions, type PolicyRule, defaultPolicy } from './assistance-policy.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { buildJourneyContext } from './journey-context.ts';

export type TimelineStep = {
  index: number;
  label: string;
  eventType: WanderlyEventType;
  entity?: string;
  decision: AssistanceDecision;
  assistanceType: AssistanceType;
  confidence: number;
  policyRule: PolicyRule;
  /** True when the decision differs from the previous step. */
  flipped: boolean;
};

const SKIPPED = ['PAGE_VIEW', 'SESSION_START'];

/**
 * Replays the journey one visitor event at a time and records how the decision and the
 * policy result evolve. Lifecycle (ASSISTANCE_*) events are excluded so the timeline shows
 * only what the visitor did.
 */
export function buildSignalTimeline(events: WanderlyEvent[], options: PolicyOptions = defaultPolicy, now = new Date(0)): TimelineStep[] {
  const visitorEvents = events.filter(e => !SKIPPED.includes(e.eventType) && !e.eventType.startsWith('ASSISTANCE_'));
  const steps: TimelineStep[] = [];
  visitorEvents.forEach((event, i) => {
    const prefix = visitorEvents.slice(0, i + 1);
    const context = buildJourneyContext(prefix);
    const decision = decideAssistance(context);
    const policy = evaluatePolicy(decision, context, [], now, options);
    steps.push({
      index: i,
      label: event.entity ? `${event.eventType.replaceAll('_', ' ')} · ${event.entity}` : event.eventType.replaceAll('_', ' '),
      eventType: event.eventType,
      entity: event.entity,
      decision: decision.decision,
      assistanceType: decision.assistanceType,
      confidence: decision.confidence,
      policyRule: policy.rule,
      flipped: i > 0 && steps[i - 1].decision !== decision.decision,
    });
  });
  return steps;
}
