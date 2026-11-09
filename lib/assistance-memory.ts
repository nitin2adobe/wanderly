import type { WanderlyEvent } from './events.ts';
import type { ConciergePriority } from './concierge-handoff.ts';

export type SessionMemory = {
  /** Dismissals made by the visitor; withdrawals by the plugin itself do not count. */
  visitorDismissals: number;
  acceptedTypes: string[];
  /** The most recent priority the visitor chose in the concierge, if any. */
  preferredPriority?: ConciergePriority;
};

const PRIORITIES: ConciergePriority[] = ['BUDGET', 'ACTIVITIES', 'TRIP_LENGTH'];

/** Derives what the plugin has learned this session from its own lifecycle events. */
export function deriveMemory(sessionEvents: WanderlyEvent[]): SessionMemory {
  const memory: SessionMemory = { visitorDismissals: 0, acceptedTypes: [] };
  for (const e of sessionEvents) {
    if (e.eventType === 'ASSISTANCE_DISMISSED' && e.metadata?.reason !== 'withdrawn' && e.metadata?.reason !== 'unrestorable') memory.visitorDismissals++;
    if (e.eventType === 'ASSISTANCE_ACCEPTED' && typeof e.metadata?.assistanceType === 'string') memory.acceptedTypes.push(e.metadata.assistanceType);
    if (e.eventType === 'ASSISTANCE_PREFERENCE' && PRIORITIES.includes(e.metadata?.priority as ConciergePriority)) memory.preferredPriority = e.metadata?.priority as ConciergePriority;
  }
  return memory;
}
