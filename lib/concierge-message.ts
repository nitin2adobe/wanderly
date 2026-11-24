import { formatList } from './assistance-copy.ts';
import type { ConciergeHandoff, ConciergePriority } from './concierge-handoff.ts';

export const MAX_OPENING_MESSAGE_LENGTH = 240;
const priorityClause: Record<ConciergePriority, string> = {
  BUDGET: 'The explicitly chosen priority is budget.',
  ACTIVITIES: 'The explicitly chosen priority is things to do.',
  TRIP_LENGTH: 'The explicitly chosen priority is trip length.',
};
const cleanEntities = (entities: string[]) =>
  [...new Set(entities.map(entity => entity.replace(/[^\p{L}\p{N} &'-]/gu, '').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3);

function intentMessage(handoff: Pick<ConciergeHandoff, 'intent' | 'topic'>, entities: string[], destinations: string[]) {
  const list = formatList(entities);
  switch (handoff.intent) {
    case 'DESTINATION_COMPARISON':
      return entities.length > 1 ? `Help compare ${list} by trip style, travel logistics and trade-offs.` :
        list ? `Help explore ${list} by trip style, travel logistics and trade-offs.` : 'Help narrow down a destination by trip style and travel logistics.';
    case 'PACKAGE_SELECTION':
      return list ? `Help compare ${list} by nights, pace, inclusions and illustrative price.` :
        destinations.length ? `Explain the package options for ${formatList(destinations)} and their trade-offs.` : 'Explain the travel package options and their trade-offs.';
    case 'TRAVEL_INFORMATION':
      return handoff.topic ? `${list ? `For ${list}: ` : ''}${handoff.topic}` :
        list ? `Explain practical planning considerations for ${list} and what must be verified before travel.` : 'Explain what practical details should be verified before travel.';
  }
}

/** Suggested question based on browsing, not a claim that the visitor typed it. */
export function conciergeOpeningMessage(
  handoff: Pick<ConciergeHandoff, 'intent' | 'entities' | 'explicitPreferences' | 'topic'>,
  destinationsViewed: string[] = [],
): string {
  const entities = cleanEntities(handoff.entities);
  const destinations = cleanEntities(destinationsViewed);
  // Keep the explicit preference by reducing entity count before dropping useful context.
  const priority = handoff.explicitPreferences.priority;
  const suffix = priority && priorityClause[priority] ? ` ${priorityClause[priority]}` : '';
  for (let count = entities.length; count >= 0; count--) {
    const base = intentMessage(handoff, entities.slice(0, count), destinations);
    if (base.length + suffix.length <= MAX_OPENING_MESSAGE_LENGTH) return base + suffix;
  }
  return intentMessage({ intent: handoff.intent }, [], []).slice(0, MAX_OPENING_MESSAGE_LENGTH);
}
