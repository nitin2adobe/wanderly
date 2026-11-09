import type { AssistanceCopy } from './assistance-copy.ts';
import type { ConciergeIntent, ConciergePriority } from './concierge-handoff.ts';
import { destinations, packages } from './data.ts';
import type { WanderlyEventType } from './events.ts';

export type BrandLookup = { detail: string; image?: string };

/** Everything brand-specific the activation plugin and the demo concierge need. */
export type BrandConfig = {
  id: string;
  displayName: string;
  /** Visitor-facing names for the three quick replies (the keys are engine-level). */
  labels: Record<ConciergePriority, string>;
  lookup(entity: string, priority: ConciergePriority, intent: ConciergeIntent): BrandLookup | undefined;
  /** Optional wording overrides where the engine's default copy does not fit the brand. */
  copy?: Partial<Record<ConciergeIntent, (list: string) => Omit<AssistanceCopy, 'dismiss'>>>;
  /** Brand wording for engine event names, used only for display. */
  eventLabels?: Partial<Record<WanderlyEventType, string>>;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const wanderly: BrandConfig = {
  id: 'wanderly',
  displayName: 'Wanderly',
  labels: { BUDGET: 'Budget', ACTIVITIES: 'Activities', TRIP_LENGTH: 'Trip length' },
  lookup(entity, priority, intent) {
    const destination = destinations.find(d => same(d.name, entity));
    // Package prices are only quoted when the visitor was looking at packages.
    const pack = intent === 'PACKAGE_SELECTION' ? packages.find(p => same(p.packageName, entity) || same(p.name, entity)) : undefined;
    const source = pack ?? destination;
    if (!source) return undefined;
    const image = destination?.image;
    switch (priority) {
      case 'BUDGET': return { detail: pack ? `${pack.packageName} is ${pack.price}.` : `Trips start from ${source.from}.`, image };
      case 'ACTIVITIES': return { detail: `Highlights: ${source.highlights.join(', ')}.`, image };
      case 'TRIP_LENGTH': return { detail: `A typical trip is ${source.days}.`, image };
    }
  },
};

type Product = { name: string; price: string; features: string; warrantyYears: number };

/** FIXTURE ONLY: illustrative catalog for the electronics adapter demonstration. */
export const electronicsCatalog: Product[] = [
  { name: 'Laptop Pro 14', price: '$1,899', features: 'Fast pro chip, 18-hour battery, OLED display', warrantyYears: 3 },
  { name: 'Laptop Air 13', price: '$1,199', features: 'Ultralight 1.2 kg, 15-hour battery, fanless design', warrantyYears: 1 },
  { name: 'Laptop Studio 16', price: '$2,499', features: 'Dedicated GPU, 16-inch mini-LED, up to 64 GB memory', warrantyYears: 2 },
];

const electronics: BrandConfig = {
  id: 'electronics-demo',
  displayName: 'Volt Electronics',
  labels: { BUDGET: 'Price', ACTIVITIES: 'Features', TRIP_LENGTH: 'Warranty' },
  eventLabels: { DESTINATION_VIEW: 'PRODUCT VIEW', COMPARE_VIEW: 'SPEC COMPARE', FAQ_SEARCH: 'WARRANTY FAQ', BOOKING_START: 'CHECKOUT START' },
  lookup(entity, priority) {
    const product = electronicsCatalog.find(p => same(p.name, entity));
    if (!product) return undefined;
    switch (priority) {
      case 'BUDGET': return { detail: `${product.name} is ${product.price}.` };
      case 'ACTIVITIES': return { detail: `${product.features}.` };
      case 'TRIP_LENGTH': return { detail: `Includes a ${product.warrantyYears}-year warranty.` };
    }
  },
  copy: {
    PACKAGE_SELECTION: list => ({ headline: list ? `Need help choosing between ${list}?` : 'Need help choosing a product?', body: 'I can summarise what each one offers.', cta: 'Compare products' }),
    TRAVEL_INFORMATION: list => ({ headline: list ? `Questions about ${list}?` : 'Questions about this product?', body: 'I can help with warranty and support questions.', cta: 'Ask about warranty' }),
  },
};

export const brandConfigs: Record<string, BrandConfig> = { [wanderly.id]: wanderly, [electronics.id]: electronics };

export const getBrandConfig = (id: string): BrandConfig | undefined => brandConfigs[id];

/** The demo storefront at /demo/electronics is the only non-Wanderly surface. */
export const brandIdForPath = (pathname: string | null): string =>
  pathname === '/demo/electronics' || pathname?.startsWith('/demo/electronics/') ? electronics.id : wanderly.id;
