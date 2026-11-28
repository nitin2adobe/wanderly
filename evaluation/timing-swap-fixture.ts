import { destinations, packages } from '../lib/data.ts';
import type { LabelledJourney } from '../lib/labelled-journeys.ts';

// Pair valid destinations and their corresponding packages bijectively.
const partners = [4, 5, 3, 2, 0, 1];
const destinationSwap = new Map(destinations.map((destination, i) => {
  const replacement = destinations[partners[i]];
  if (!replacement || partners[partners[i]] !== i) throw new Error('Invalid destination swap fixture');
  return [destination.slug, replacement.slug];
}));
const packageSwap = new Map(packages.map(item => {
  const source = packages.filter(candidate => candidate.slug === item.slug);
  const target = packages.filter(candidate => candidate.slug === destinationSwap.get(item.slug));
  const replacement = target[source.findIndex(candidate => candidate.id === item.id)];
  if (!replacement || source.length !== target.length) throw new Error('Invalid package swap fixture');
  return [item.id, replacement.id];
}));

export function swapJourney(journey: LabelledJourney): LabelledJourney {
  return {
    ...journey,
    events: journey.events.map(([type, entity]) => {
      if (!entity) return [type];
      if (type === 'FAQ_SEARCH') {
        const destination = destinations.find(item => entity.startsWith(`${item.slug}-`));
        if (destination) return [type, `${destinationSwap.get(destination.slug)}${entity.slice(destination.slug.length)}`];
      }
      if (['DESTINATION_VIEW', 'COMPARE_ADD', 'COMPARE_REMOVE', 'TRAVEL_INFO_VIEW'].includes(type)) return [type, destinationSwap.get(entity) ?? entity];
      if (type === 'PACKAGE_VIEW' || type === 'PRICE_VIEW') return [type, packageSwap.get(entity) ?? entity];
      return [type, entity];
    }),
  };
}
