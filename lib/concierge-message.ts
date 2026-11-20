import { formatList } from './assistance-copy.ts';
import type { ConciergeHandoff, ConciergePriority } from './concierge-handoff.ts';

export const MAX_OPENING_MESSAGE_LENGTH = 240;
const MAX_ENTITIES = 3;
const FALLBACK_MESSAGE = 'Hi';

const priorityClause: Record<ConciergePriority, string> = {
  BUDGET: 'My main priority is budget.',
  ACTIVITIES: 'My main priority is things to do.',
  TRIP_LENGTH: 'My main priority is trip length.',
};

const cleanEntities = (entities: string[]) =>
  [...new Set(entities.map(entity => entity.replace(/[^\p{L}\p{N} &'-]/gu, '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, MAX_ENTITIES);

function intentMessage(intent: ConciergeHandoff['intent'], entities: string[], destinations: string[] = []): string {
  const list = formatList(entities);
  switch (intent) {
    case 'DESTINATION_COMPARISON':
      return entities.length > 1
        ? `I'm comparing ${list}. Can you help me decide which suits me better?`
        : "I'm trying to choose a destination. Can you help me narrow it down?";
    case 'PACKAGE_SELECTION':
      if (entities.length > 1) return `I'm looking at the ${list} packages. What's the difference?`;
      if (list) return `I'm looking at the ${list} package. Are there other options I should consider?`;
      // Package-selection entities are package names; with none viewed, ask about the destinations instead.
      return destinations.length ? `Are there other packages for ${formatList(destinations)}?` : 'Can you help me choose a travel package?';
    case 'TRAVEL_INFORMATION':
      return list ? `I'm planning a trip to ${list}. What should I know before I go?` : "I'm planning a trip. What should I know before I go?";
    default:
      return FALLBACK_MESSAGE;
  }
}

/**
 * First-person opening message submitted to Brand Concierge on the visitor's behalf.
 * Built only from catalog entity names, the intent and an explicitly chosen priority — never raw events or identifiers.
 * `destinationsViewed` is used only when a package-selection handoff names no packages.
 */
export function conciergeOpeningMessage(
  handoff: Pick<ConciergeHandoff, 'intent' | 'entities' | 'explicitPreferences'>,
  destinationsViewed: string[] = [],
): string {
  const base = intentMessage(handoff.intent, cleanEntities(handoff.entities), cleanEntities(destinationsViewed));
  const priority = handoff.explicitPreferences?.priority;
  const withPriority = priority && priorityClause[priority] ? `${base} ${priorityClause[priority]}` : base;
  if (withPriority.length <= MAX_OPENING_MESSAGE_LENGTH) return withPriority;
  if (base.length <= MAX_OPENING_MESSAGE_LENGTH) return base;
  return intentMessage(handoff.intent, []);
}
