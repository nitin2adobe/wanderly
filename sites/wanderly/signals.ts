import type { SiteProfile } from '../../aaa/contracts/types.ts';
import { destinations } from '../../lib/data.ts';
import { travelFaqs } from '../../lib/travel-info.ts';

const paceValues = { All: 'any', Relaxed: 'relaxed', Balanced: 'balanced', Active: 'active' } as const;

export function packagePaceSelection(value: string, profile: Readonly<SiteProfile>) {
  if (!Object.hasOwn(paceValues, value)) return undefined;
  const pace = profile.facets.find(facet => facet.id === 'pace');
  if (!pace || !Object.values(paceValues).every(id => pace.values.some(item => item.id === id))) return undefined;
  return { facetId: 'pace', valueIds: [paceValues[value as keyof typeof paceValues]] };
}

export function faqDestinationId(entity: string | undefined): string | undefined {
  return destinations.find(destination =>
    travelFaqs(destination).some(faq => `${destination.slug}-${faq.id}` === entity),
  )?.slug;
}
