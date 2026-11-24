import type { ConciergeClientEvent } from './brand-concierge-client.ts';
import type { WanderlyEventType } from './events.ts';

type RecordEvent = (type: WanderlyEventType, metadata: Record<string, unknown>) => void;

/** Records metadata only. Documented callbacks do not expose response text for answer validation. */
export function createConciergeObserver({
  activationId, assistanceType, question, record, now = Date.now,
}: {
  activationId: string; assistanceType: string; question?: string;
  record: RecordEvent; now?: () => number;
}) {
  const seen = new Set<string>();
  const interactions = new Map<string, { started?: number; completed?: number }>();
  let queries = 0;
  return (event: ConciergeClientEvent) => {
    const data = event.data;
    const conversationId = data?.conversationId;
    const interactionId = data?.interactionId;
    const metadata: Record<string, unknown> = { activationId, assistanceType };
    if (conversationId) metadata.conversationId = conversationId;
    if (interactionId) metadata.interactionId = interactionId;
    if (event.eventType === 'query:submitted') {
      queries++;
      record('ASSISTANCE_QUERY_SUBMITTED', { ...metadata, questionKind: data?.query === question ? 'suggested' : 'visitor', queryNumber: queries });
      return;
    }
    if (event.eventType === 'error:occurred') {
      record('ASSISTANCE_FAILED', { ...metadata, phase: 'service', reason: 'sdk-error' });
      return;
    }
    if (!interactionId || !conversationId) return;
    const key = `${conversationId}:${interactionId}`;
    const eventKey = `${key}:${event.eventType}`;
    if (seen.has(eventKey)) return;
    const interaction = interactions.get(key) ?? {};
    if (event.eventType === 'response:started') {
      seen.add(eventKey);
      interaction.started = now();
      interactions.set(key, interaction);
      record('ASSISTANCE_RESPONSE_STARTED', { ...metadata, correlatedQuery: queries > 0 });
    } else if (event.eventType === 'response:completed') {
      seen.add(eventKey);
      interaction.completed = now();
      interactions.set(key, interaction);
      record('ASSISTANCE_RESPONSE_COMPLETED', {
        ...metadata, correlatedQuery: queries > 0,
        ...(interaction.started !== undefined ? { responseMs: Math.max(0, interaction.completed - interaction.started) } : {}),
      });
    } else if (event.eventType === 'feedback:submitted' && (data?.feedbackType === 'positive' || data?.feedbackType === 'negative')) {
      seen.add(eventKey);
      record('ASSISTANCE_FEEDBACK', { ...metadata, feedback: data.feedbackType });
    }
  };
}

/** Query callbacks have no interaction ID. Attribute only when one activation is awaiting a response. */
export function createConciergeEventRouter(record: RecordEvent) {
  type Observer = ReturnType<typeof createConciergeObserver>;
  let current: Observer | undefined;
  const pending = new Map<Observer, number>();
  const owners = new Map<string, Observer>();
  const completed = new Set<string>();
  return {
    begin(activation: { activationId: string; assistanceType: string; question?: string }) {
      current = createConciergeObserver({ ...activation, record });
    },
    receive(event: ConciergeClientEvent) {
      if (event.eventType === 'query:submitted') {
        if (current) {
          pending.set(current, (pending.get(current) ?? 0) + 1);
          current(event);
        }
        return;
      }
      const { conversationId, interactionId } = event.data ?? {};
      if (conversationId && interactionId) {
        const key = `${conversationId}:${interactionId}`;
        let owner = owners.get(key);
        if (!owner && event.eventType.startsWith('response:')) {
          const candidates = [...pending].filter(([, count]) => count > 0).map(([observer]) => observer);
          if (candidates.length === 1) {
            owner = candidates[0];
            owners.set(key, owner);
          } else {
            console.warn('Brand Concierge response attribution is ambiguous; no activation outcome was inferred.');
          }
        }
        owner?.(event);
        if (owner && event.eventType === 'response:completed' && !completed.has(key)) {
          completed.add(key);
          pending.set(owner, Math.max(0, (pending.get(owner) ?? 0) - 1));
        }
        return;
      }
      current?.(event);
    },
  };
}
