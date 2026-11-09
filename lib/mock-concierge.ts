import { destinations, packages } from './data.ts';
import { conciergePriorities, validateHandoff, type ConciergeHandoff, type ConciergeIntent, type ConciergePriority } from './concierge-handoff.ts';
import { formatList } from './assistance-copy.ts';

export type QuickReply = { priority: ConciergePriority; label: string };
export type ConciergeFact = { entity: string; detail: string };
export type ConciergeReply = { message: string; facts: ConciergeFact[]; followUp: string };
export type ConciergeOpening = { message: string; quickReplies: QuickReply[] };

const labels: Record<ConciergePriority, string> = { BUDGET: 'Budget', ACTIVITIES: 'Activities', TRIP_LENGTH: 'Trip length' };
const quickReplies: QuickReply[] = conciergePriorities.map(priority => ({ priority, label: labels[priority] }));

const openings: Record<ConciergeIntent, (list: string) => string> = {
  DESTINATION_COMPARISON: list => list ? `Let's compare ${list}. What matters most to you?` : "Let's find the right destination. What matters most to you?",
  PACKAGE_SELECTION: list => list ? `Let's look at the ${list} packages. What matters most to you?` : "Let's find the right package. What matters most to you?",
  TRAVEL_INFORMATION: list => list ? `Happy to help with ${list}. Which of these matters most?` : 'Happy to help. Which of these matters most?',
};

function parse(handoff: unknown): ConciergeHandoff {
  const result = validateHandoff(handoff);
  if (!result.valid) throw new Error(`Invalid concierge handoff: ${result.errors.join(' ')}`);
  return result.value;
}

/** Everything the concierge says is derived from the handoff payload and curated Wanderly data. */
export function openConcierge(handoff: unknown): ConciergeOpening {
  const h = parse(handoff);
  return { message: openings[h.intent](formatList(h.entities)), quickReplies };
}

function detailFor(entity: string, priority: ConciergePriority, intent: ConciergeIntent): string {
  const key = entity.trim().toLowerCase();
  const destination = destinations.find(d => d.name.toLowerCase() === key);
  // Package prices are only quoted when the visitor was looking at packages.
  const pack = intent === 'PACKAGE_SELECTION'
    ? packages.find(p => p.packageName.toLowerCase() === key || p.name.toLowerCase() === key)
    : undefined;
  if (!destination && !pack) return "I don't have details for this yet.";
  const source = pack ?? destination!;
  switch (priority) {
    case 'BUDGET': return pack ? `${pack.packageName} is ${pack.price}.` : `Trips start from ${source.from}.`;
    case 'ACTIVITIES': return `Highlights: ${source.highlights.join(', ')}.`;
    case 'TRIP_LENGTH': return `A typical trip is ${source.days}.`;
  }
}

export function replyToPriority(handoff: unknown, priority: ConciergePriority): ConciergeReply {
  const h = parse(handoff);
  if (!conciergePriorities.includes(priority)) throw new Error(`Unknown priority: ${priority}`);
  return {
    message: `Here is how they compare on ${labels[priority].toLowerCase()}.`,
    facts: h.entities.map(entity => ({ entity, detail: detailFor(entity, priority, h.intent) })),
    followUp: 'These are illustrative POC details. Want to look at another priority?',
  };
}
