import { createHash } from 'node:crypto';
import { destinations, packages } from './data.ts';
import { travelFaqs } from './travel-info.ts';

export function conciergeKnowledge() {
  const content = {
    disclaimer: 'Wanderly is a fictional demo. Prices, stays, routes and availability are illustrative, not live quotes or reservations.',
    priceBasis: 'USD per person, two adults sharing. International flights, insurance and unlisted extras are excluded. Never infer a party total or child/single price.',
    guardrails: [
      'Use only these catalog facts for package prices, nights, pacing and inclusions. Acknowledge missing details instead of inventing facts.',
      'State that prices are illustrative when quoting them. Do not promise availability, weather, refunds, entry eligibility or confirmed bookings.',
      'Explain trade-offs; ask one useful clarifying question when the visitor has not stated a priority. Do not infer sensitive traits.',
      'For current entry requirements or provider terms, ask the visitor to verify official guidance and the actual quote.',
    ],
    destinations: destinations.map(destination => ({
      ...destination, path: `/destinations/${destination.slug}`, faqs: travelFaqs(destination),
    })),
    packages: packages.map(pack => ({
      id: pack.id, destinationSlug: pack.slug, name: pack.packageName,
      path: `/packages/${pack.id}`, currency: 'USD', illustrativePricePerPerson: pack.priceValue,
      nights: pack.nights, pace: pack.pace, stay: pack.stay, summary: pack.summary,
      included: pack.included, excluded: pack.excluded, itinerary: pack.itinerary,
    })),
  };
  const version = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  return { version, ...content };
}

export function conciergeKnowledgeCsv(baseUrl: string) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('Supply an approved public HTTPS base URL without credentials, query or fragment.');
  }
  const root = base.href.replace(/\/$/, '');
  const data = conciergeKnowledge();
  const rows = [
    { path: '/concierge-knowledge', title: 'Wanderly catalog and guardrails' },
    ...data.destinations.map(destination => ({ path: destination.path, title: destination.name })),
    ...data.packages.map(pack => ({ path: pack.path, title: pack.name })),
  ];
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return 'url,title,catalog_version\r\n' + rows.map(row => [root + row.path, row.title, data.version].map(quote).join(',')).join('\r\n') + '\r\n';
}
