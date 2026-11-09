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
};

const comparisonJourney: ScenarioEvent[] = [
  ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'],
];

export const demoScenarios: DemoScenario[] = [
  {
    id: 'right-moment',
    title: 'Right moment',
    description: 'A visitor switches between Bali and Maldives and opens the comparison without deciding.',
    expectation: 'A balloon offers help comparing Bali and Maldives. Accept it to see the concierge open with that context.',
    events: comparisonJourney,
  },
  {
    id: 'right-restraint',
    title: 'Right restraint',
    description: 'The same comparison, but the visitor then searches dates and starts booking.',
    expectation: 'The balloon appears, then withdraws on its own once booking starts, and is not shown again.',
    events: comparisonJourney,
    followUp: { delayMs: 4500, events: [['DATE_SEARCH'], ['BOOKING_START']] },
  },
  {
    id: 'respectful-adaptation',
    title: 'Respectful adaptation',
    description: 'The same comparison, but the visitor declines help.',
    expectation: 'Click "Not now". Keep browsing: the concierge does not interrupt again.',
    events: comparisonJourney,
  },
];

export function pageForEvent(type: WanderlyEventType, entity?: string): string {
  if (type === 'DESTINATION_VIEW' && entity) return `/destinations/${entity}`;
  if (type.startsWith('COMPARE_')) return '/compare';
  if (type === 'DATE_SEARCH' || type.startsWith('BOOKING_')) return '/booking';
  return '/';
}
