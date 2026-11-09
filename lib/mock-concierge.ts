import { conciergePriorities, validateHandoff, type ConciergeHandoff, type ConciergeIntent, type ConciergePriority } from './concierge-handoff.ts';
import { formatList } from './assistance-copy.ts';
import { getBrandConfig, type BrandConfig } from './brand-config.ts';

export type QuickReply = { priority: ConciergePriority; label: string };
export type ConciergeFact = { entity: string; detail: string; image?: string };
export type ConciergeReply = { message: string; facts: ConciergeFact[]; followUp: string };
export type ConciergeOpening = { message: string; quickReplies: QuickReply[]; /** Set when a stated preference was carried over from earlier in the session. */ note?: string };

const openings: Record<ConciergeIntent, (list: string) => string> = {
  DESTINATION_COMPARISON: list => list ? `Let's compare ${list}. What matters most to you?` : "Let's find the right option. What matters most to you?",
  PACKAGE_SELECTION: list => list ? `Let's look at the ${list} packages. What matters most to you?` : "Let's find the right choice. What matters most to you?",
  TRAVEL_INFORMATION: list => list ? `Happy to help with ${list}. Which of these matters most?` : 'Happy to help. Which of these matters most?',
};

function parse(handoff: unknown): { h: ConciergeHandoff; brand: BrandConfig } {
  const result = validateHandoff(handoff);
  if (!result.valid) throw new Error(`Invalid concierge handoff: ${result.errors.join(' ')}`);
  const brand = getBrandConfig(result.value.brand);
  if (!brand) throw new Error(`Unknown brand: ${result.value.brand}`);
  return { h: result.value, brand };
}

/** Everything the concierge says is derived from the handoff payload and the brand's curated data. */
export function openConcierge(handoff: unknown): ConciergeOpening {
  const { h, brand } = parse(handoff);
  const priority = h.explicitPreferences.priority;
  return {
    message: openings[h.intent](formatList(h.entities)),
    quickReplies: conciergePriorities.map(p => ({ priority: p, label: brand.labels[p] })),
    ...(priority ? { note: `Using what you told me earlier: ${brand.labels[priority].toLowerCase()} matters most.` } : {}),
  };
}

export function replyToPriority(handoff: unknown, priority: ConciergePriority): ConciergeReply {
  const { h, brand } = parse(handoff);
  if (!conciergePriorities.includes(priority)) throw new Error(`Unknown priority: ${priority}`);
  return {
    message: `Here is how they compare on ${brand.labels[priority].toLowerCase()}.`,
    facts: h.entities.map(entity => {
      const found = brand.lookup(entity, priority, h.intent);
      return { entity, detail: found?.detail ?? "I don't have details for this yet.", ...(found?.image ? { image: found.image } : {}) };
    }),
    followUp: 'These are illustrative POC details. Want to look at another priority?',
  };
}
