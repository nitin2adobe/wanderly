import type { ElectronicsEvent } from './brand-adapters.ts';
import type { WanderlyEventType } from './events.ts';

export type ScenarioEvent = [WanderlyEventType, string?];

export type DemoScenario = {
  id: 'right-moment' | 'right-restraint' | 'respectful-adaptation';
  title: string;
  description: string;
  /** What the audience should observe. */
  expectation: string;
  /** Replayed immediately into a fresh session. */
  events: ScenarioEvent[];
  /** Replayed after the balloon has had time to appear. */
  followUp?: { delayMs: number; events: ScenarioEvent[] };
  /** The same story told through the electronics fixture brand. */
  electronics: { expectation: string; events: ElectronicsEvent[]; followUp?: { delayMs: number; events: ElectronicsEvent[] } };
};

const comparisonJourney: ScenarioEvent[] = [
  ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
];

const laptopComparison: ElectronicsEvent[] = [
  { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' }, { type: 'PRODUCT_VIEW', sku: 'laptop-air-13' }, { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' },
  { type: 'SPEC_COMPARE' }, { type: 'PRODUCT_VIEW', sku: 'laptop-air-13' },
];

export const demoScenarios: DemoScenario[] = [
  {
    id: 'right-moment',
    title: 'Right moment',
    description: 'A visitor switches between Bali and Maldives and opens the comparison without deciding.',
    expectation: 'A balloon offers help comparing Bali and Maldives. Accept it to see the concierge open with that context.',
    events: comparisonJourney,
    electronics: { expectation: 'A balloon offers help comparing Laptop Pro 14 and Laptop Air 13. Accept it to see the concierge open with that context.', events: laptopComparison },
  },
  {
    id: 'right-restraint',
    title: 'Right restraint',
    description: 'The same comparison, but the visitor then searches dates and starts booking.',
    expectation: 'The balloon appears, then withdraws on its own once booking starts, and is not shown again.',
    events: comparisonJourney,
    followUp: { delayMs: 4500, events: [['DATE_SEARCH'], ['BOOKING_START']] },
    electronics: { expectation: 'The balloon appears, then withdraws on its own once checkout starts, and is not shown again.', events: laptopComparison, followUp: { delayMs: 4500, events: [{ type: 'CHECKOUT_START' }] } },
  },
  {
    id: 'respectful-adaptation',
    title: 'Respectful adaptation',
    description: 'The same comparison, but the visitor declines help.',
    expectation: 'Click "Not now". Keep browsing: the concierge does not interrupt again.',
    events: comparisonJourney,
    electronics: { expectation: 'Click "Not now". Keep browsing: the concierge does not interrupt again.', events: laptopComparison },
  },
];

export function pageForEvent(type: WanderlyEventType, entity?: string): string {
  if (type === 'DESTINATION_VIEW' && entity) return `/destinations/${entity}`;
  if (type.startsWith('COMPARE_')) return '/compare';
  if (type === 'DATE_SEARCH' || type.startsWith('BOOKING_')) return '/booking';
  return '/';
}
