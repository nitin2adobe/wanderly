import type { WanderlyEvent, WanderlyEventType } from './events.ts';

/**
 * A brand adapter translates a brand's own browsing events into the engine's generic
 * journey signals. Everything downstream (context, decision, policy, handoff) is shared.
 */
export type BrandAdapter<Raw> = {
  readonly brand: string;
  toEvent(raw: Raw): { eventType: WanderlyEventType; entity?: string } | null;
};

export function adaptEvents<Raw>(adapter: BrandAdapter<Raw>, raw: Raw[], sessionId: string, startMs = 0): WanderlyEvent[] {
  const events: WanderlyEvent[] = [];
  for (const item of raw) {
    const mapped = adapter.toEvent(item);
    if (!mapped) continue;
    events.push({
      id: `${adapter.brand}-${events.length}`,
      sessionId,
      timestamp: new Date(startMs + (events.length + 1) * 1000).toISOString(),
      page: '/',
      ...mapped,
    });
  }
  return events;
}

/**
 * FIXTURE ONLY: an illustrative electronics retailer used to show the engine is not
 * Wanderly-specific. It is not a validated integration. Intent names such as
 * DESTINATION_COMPARISON are still travel-flavoured in the engine and would be
 * generalised before a production multi-brand release.
 */
export type ElectronicsEvent =
  | { type: 'PRODUCT_VIEW'; sku: string }
  | { type: 'SPEC_COMPARE' }
  | { type: 'WARRANTY_FAQ'; question: string }
  | { type: 'CHECKOUT_START' }
  | { type: 'HEARTBEAT' };

export const electronicsAdapter: BrandAdapter<ElectronicsEvent> = {
  brand: 'electronics-demo',
  toEvent(raw) {
    switch (raw.type) {
      case 'PRODUCT_VIEW': return { eventType: 'DESTINATION_VIEW', entity: raw.sku };
      case 'SPEC_COMPARE': return { eventType: 'COMPARE_VIEW' };
      case 'WARRANTY_FAQ': return { eventType: 'FAQ_SEARCH', entity: raw.question };
      case 'CHECKOUT_START': return { eventType: 'BOOKING_START' };
      default: return null;
    }
  },
};
