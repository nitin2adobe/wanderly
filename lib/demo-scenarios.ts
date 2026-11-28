import type { ElectronicsEvent } from './brand-adapters.ts';
import type { WanderlyEventType } from './events.ts';
import { getDestination, getPackage } from './data.ts';

export type ScenarioEvent = [WanderlyEventType, string?];

export type DemoScenario = {
  id: 'right-moment' | 'package-selection' | 'travel-information' | 'right-restraint' | 'respectful-adaptation';
  title: string;
  description: string;
  /** What the audience should observe. */
  expectation: string;
  /** Replayed immediately into a fresh session. */
  events: ScenarioEvent[];
  landingPage: string;
  /** Replayed after assistance has had time to appear. */
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
    expectation: 'An invitation suggests comparing the selected destinations. Opening chat does not submit a question; the visitor chooses whether to send it.',
    events: comparisonJourney,
    landingPage: '/compare',
    electronics: { expectation: 'A balloon offers help comparing Laptop Pro 14 and Laptop Air 13. Live chat is not configured for this fixture.', events: laptopComparison },
  },
  {
    id: 'package-selection',
    title: 'Choose a package',
    description: 'A visitor compares Island Rhythm and Bali Slow Living, revisits their prices, and has not chosen a journey.',
    expectation: 'An invitation offers help choosing a package. Opening chat does not submit a question; the visitor chooses whether to send it.',
    events: [
      ['DESTINATION_VIEW', 'bali'],
      ['PACKAGE_VIEW', 'island-rhythm'], ['PRICE_VIEW', 'island-rhythm'],
      ['PACKAGE_VIEW', 'bali-slow-living'], ['PRICE_VIEW', 'bali-slow-living'],
      ['PACKAGE_VIEW', 'island-rhythm'], ['PRICE_VIEW', 'island-rhythm'],
      ['PACKAGE_VIEW', 'bali-slow-living'], ['PRICE_VIEW', 'bali-slow-living'],
    ],
    landingPage: '/packages/bali-slow-living',
    electronics: { expectation: 'A balloon offers help with Laptop Pro 14 and Laptop Air 13 specifications. Live chat is not configured for this fixture.', events: laptopComparison },
  },
  {
    id: 'travel-information',
    title: 'Practical travel questions',
    description: 'A visitor planning Japan checks transfer guidance and returns to the entry-requirements question before selecting dates.',
    expectation: 'An invitation offers practical planning help. The demo cannot determine visa eligibility or guarantee entry.',
    events: [
      ['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW', 'japan'],
      ['FAQ_SEARCH', 'japan-transfers'], ['FAQ_SEARCH', 'japan-entry'],
    ],
    landingPage: '/travel-info?destination=japan',
    electronics: {
      expectation: 'A balloon offers warranty-information help, not a specifications comparison. Live chat is not configured for this fixture.',
      events: [
        { type: 'PRODUCT_VIEW', sku: 'laptop-pro-14' },
        { type: 'WARRANTY_FAQ', question: 'Does the warranty cover battery wear?' },
        { type: 'WARRANTY_FAQ', question: 'How do I claim support?' },
      ],
    },
  },
  {
    id: 'right-restraint',
    title: 'Right restraint',
    description: 'The same comparison, but the visitor then searches dates and starts booking.',
    expectation: 'Booking progress is already present when the agent evaluates, so the chat stays closed and no question is suggested or sent.',
    events: [...comparisonJourney, ['DATE_SEARCH'], ['BOOKING_START']],
    landingPage: '/destinations/maldives',
    electronics: { expectation: 'The balloon appears, then withdraws on its own once checkout starts, and is not shown again.', events: laptopComparison, followUp: { delayMs: 4500, events: [{ type: 'CHECKOUT_START' }] } },
  },
  {
    id: 'respectful-adaptation',
    title: 'Respectful adaptation',
    description: 'The same comparison, but the visitor closes the chat.',
    expectation: 'Dismiss the invitation with “Not now”. Keep browsing: the same assistance is not triggered again in this session.',
    events: comparisonJourney,
    landingPage: '/compare',
    electronics: { expectation: 'Click "Not now". Keep browsing: the concierge does not interrupt again.', events: laptopComparison },
  },
];

export function pageForEvent(type: WanderlyEventType, entity?: string): string {
  if (type === 'DESTINATION_VIEW' && entity) return `/destinations/${entity}`;
  if (type === 'PACKAGE_VIEW' || type === 'PRICE_VIEW') return getPackage(entity ?? '') ? `/packages/${entity}` : '/packages';
  if (type === 'TRAVEL_INFO_VIEW' || type === 'FAQ_SEARCH') {
    const destination = getDestination(type === 'FAQ_SEARCH' ? entity?.split('-')[0] ?? '' : entity ?? '');
    return destination ? `/travel-info?destination=${destination.slug}` : '/travel-info';
  }
  if (type.startsWith('COMPARE_')) return '/compare';
  if (type === 'DATE_SEARCH' || type.startsWith('BOOKING_')) return '/booking';
  return '/';
}
