export type TripPace = 'Relaxed' | 'Balanced' | 'Active';
export type ItineraryStop = { stage: string; title: string; description: string };
export type Destination = {
  slug: string;
  name: string;
  country: string;
  tagline: string;
  description: string;
  image: string;
  from: string;
  days: string;
  vibe: string[];
  highlights: string[];
  bestFor: string;
  tradeoff: string;
  season: string;
  gettingAround: string;
  stayStyles: { name: string; description: string }[];
  practicalNotes: string[];
};

export const destinations: Destination[] = [
  {
    slug: 'bali', name: 'Bali', country: 'Indonesia', tagline: 'Culture, calm & coast',
    description: 'Move from emerald rice terraces and temple mornings to warm-water sunsets and design-led stays.',
    image: 'https://i.pinimg.com/originals/fa/b9/f0/fab9f0d5fea3332d5576b9e8cf55f529.jpg',
    from: '$1,890', days: '7 nights', vibe: ['Wellness', 'Culture', 'Beach'],
    highlights: ['Ubud rice terraces', 'Private pool villa', 'Temple & food trail'],
    bestFor: 'Couples and friends who want cultural mornings, cafe stops and time by the pool.',
    tradeoff: 'Changing bases means road transfers. Keep fewer stops if your priority is uninterrupted beach time.',
    season: 'Our sample route pairs outdoor mornings with flexible afternoons; allow room for rain and local celebrations.',
    gettingAround: 'Private road transfers between Ubud and the coast; walking and a driver for individual outings.',
    stayStyles: [
      { name: 'Ubud garden retreat', description: 'A small stay near rice terraces, with a pool and breakfast. A quieter base for culture and cooking experiences.' },
      { name: 'Coastal pool villa', description: 'A private-villa option with space to unwind. Beach access and pool configuration would need confirmation before booking.' },
    ],
    practicalNotes: ['Build a buffer between arrival and your first activity.', 'Choose a central Ubud base if you prefer less daily driving.', 'Confirm temple dress guidance with your local host.'],
  },
  {
    slug: 'maldives', name: 'Maldives', country: 'Indian Ocean', tagline: 'Private islands & blue horizons',
    description: 'Slow down over impossibly clear water with private villas, reef adventures and unhurried island days.',
    image: 'https://img.fischer.cz/hotels/maledivy/maledivy/dhaalu-atol/sun-siyam-iru-veli/4-resort.jpg',
    from: '$2,740', days: '6 nights', vibe: ['Romance', 'Luxury', 'Ocean'],
    highlights: ['Overwater villa', 'House reef snorkel', 'Sunset cruise'],
    bestFor: 'A honeymoon or quiet reset where one island, one unpacking and unhurried days are the point.',
    tradeoff: 'Less variety beyond the resort. Meal plans, island transfers and villa types can change the total substantially.',
    season: 'Plan flexible ocean activities; actual weather and sailing conditions can change the daily schedule.',
    gettingAround: 'An island transfer from the arrival airport, then walking around a single resort base.',
    stayStyles: [
      { name: 'Beach villa', description: 'A shore-level villa for easy sand access. Ask about privacy, shade and distance from shared facilities.' },
      { name: 'Overwater villa', description: 'A lagoon-facing upgrade. Confirm stairs, water access and suitability for children before choosing it.' },
    ],
    practicalNotes: ['Match international arrival times to the island transfer schedule.', 'Compare meal plans before comparing headline prices.', 'Ask about reef access, swimming conditions and equipment inclusions.'],
  },
  {
    slug: 'japan', name: 'Japan', country: 'East Asia', tagline: 'Tradition in motion',
    description: 'Pair Tokyo energy with Kyoto quiet, seasonal food, precise hospitality and centuries of living culture.',
    image: 'https://blueskytravel.com.vn/UserFiles/Image/cherry-blossom.jpg',
    from: '$2,320', days: '9 nights', vibe: ['Food', 'Culture', 'Cities'],
    highlights: ['Tokyo neighbourhoods', 'Kyoto temples', 'Shinkansen journey'],
    bestFor: 'First-time visitors who enjoy neighbourhood walks, regional food and a mix of city and heritage.',
    tradeoff: 'More walking and luggage changes than an island trip. Popular seasonal dates need extra planning.',
    season: 'The sample route works around city sights and seasonal gardens; blossom and foliage timing is never guaranteed.',
    gettingAround: 'Urban rail and one intercity train journey; station-to-hotel transfers should account for luggage.',
    stayStyles: [
      { name: 'Tokyo neighbourhood hotel', description: 'A compact hotel near transit and restaurants. Compare room dimensions and station access rather than star ratings alone.' },
      { name: 'Kyoto courtyard stay', description: 'A smaller heritage-style stay. Ask about stairs, bedding, quiet hours and breakfast options.' },
    ],
    practicalNotes: ['Leave space for luggage on intercity travel days.', 'Check room size and bedding for your party.', 'Keep a free evening for food discoveries instead of scheduling every meal.'],
  },
  {
    slug: 'switzerland', name: 'Switzerland', country: 'Europe', tagline: 'Alpine air & iconic rails',
    description: 'Travel by panoramic train through mountain valleys, glassy lakes and storybook villages.',
    image: 'https://prd-webrepository.firabarcelona.com/wp-content/uploads/sites/69/2023/06/19112252/descubrir_-suiza_tren_istock-908264484.jpeg',
    from: '$2,560', days: '7 nights', vibe: ['Mountains', 'Scenic rail', 'Outdoors'],
    highlights: ['Bernina-style rail', 'Alpine lake stay', 'Mountain cable car'],
    bestFor: 'Scenic-rail travellers and walkers who value views, easy connections and a quieter evening pace.',
    tradeoff: 'Mountain outings depend on conditions. Add a flexible day rather than making every connection tight.',
    season: 'Our sample routes separate rail sightseeing from optional mountain days; lift and trail operations require date-specific checks.',
    gettingAround: 'Rail between bases, with optional local boats and mountain lifts subject to operation.',
    stayStyles: [
      { name: 'Lakeside boutique stay', description: 'A town-based stay near rail connections. A practical base for lake walks and easy dinners.' },
      { name: 'Alpine village lodge', description: 'A mountain base with a slower pace. Check station transfers, elevation and accessibility needs.' },
    ],
    practicalNotes: ['Carry a smaller day bag for scenic rail journeys.', 'Keep a low-altitude alternative for poor mountain weather.', 'Check whether lift tickets and seat reservations are included.'],
  },
  {
    slug: 'thailand', name: 'Thailand', country: 'Southeast Asia', tagline: 'Street food, soft sand & discovery',
    description: 'Start with Bangkok markets and riverside neighbourhoods, then choose island downtime or northern culture.',
    image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1400&q=80',
    from: '$1,620', days: '8 nights', vibe: ['Food', 'Beach', 'Culture'],
    highlights: ['Bangkok food walk', 'Island beach days', 'Northern craft villages'],
    bestFor: 'Friends and first-time explorers who want lively food discoveries with a contrasting second base.',
    tradeoff: 'Combining city and island or northern stays adds a domestic connection; choose one region if you want less packing.',
    season: 'Choose your coastal region after checking conditions for your dates; the sample schedule includes flexible beach days.',
    gettingAround: 'City transfers plus a domestic connection; the exact flight or ferry would be confirmed for your dates.',
    stayStyles: [
      { name: 'Bangkok riverside hotel', description: 'A city base for food walks and river neighbourhoods. Compare access to transport and room noise.' },
      { name: 'Island garden bungalow', description: 'A beach-area stay with a relaxed pace. Ask about beach access and transfer duration.' },
    ],
    practicalNotes: ['Leave a connection buffer between domestic and international flights.', 'Choose a beach base around your preferred activities, not photos alone.', 'Mention dietary needs before reserving a food experience.'],
  },
  {
    slug: 'portugal', name: 'Portugal', country: 'Europe', tagline: 'Neighbourhoods, ocean air & long lunches',
    description: 'Follow Lisbon lanes to Atlantic viewpoints, then slow down with coastal walks, local food and small-town stays.',
    image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1400&q=80',
    from: '$1,780', days: '7 nights', vibe: ['Food', 'Coast', 'Cities'],
    highlights: ['Lisbon neighbourhood walk', 'Sintra day trip', 'Atlantic coastal stay'],
    bestFor: 'Travellers who like independent afternoons, food-led discovery and a city-to-coast contrast.',
    tradeoff: 'Historic streets can be hilly and uneven. A central hotel and slower walking route may matter more than fitting in every sight.',
    season: 'The sample plan alternates walking, indoor food stops and coastal time; swimming conditions need a date-specific check.',
    gettingAround: 'Walking and local transit in Lisbon, then a pre-arranged road transfer to the coast.',
    stayStyles: [
      { name: 'Lisbon neighbourhood guesthouse', description: 'A small city stay. Confirm lift access, nearby hills and nighttime noise.' },
      { name: 'Atlantic coastal inn', description: 'A quieter coastal base. Check whether a car is useful for the activities you want.' },
    ],
    practicalNotes: ['Check lift access if stairs are difficult for your party.', 'Choose between a car-free base and a more remote coastal stay.', 'Leave unscheduled time for local markets and lunches.'],
  },
];

export function getDestination(slug: string) {
  return destinations.find(destination => destination.slug === slug);
}

export type TravelPackage = Destination & {
  id: string;
  packageName: string;
  price: string;
  priceValue: number;
  nights: number;
  pace: TripPace;
  stay: string;
  summary: string;
  included: string[];
  excluded: string[];
  itinerary: ItineraryStop[];
};

type PackageSeed = {
  id: string; destinationSlug: string; packageName: string; priceValue: number;
  nights: number; pace: TripPace; stay: string; summary: string; route: [string, string, string];
};

const packageSeeds: PackageSeed[] = [
  { id: 'island-rhythm', destinationSlug: 'bali', packageName: 'Island Rhythm', priceValue: 2190, nights: 7, pace: 'Balanced', stay: 'Ubud retreat + coastal pool villa', summary: 'Culture in Ubud, a guided food trail and a villa finish by the coast.', route: ['Arrive and settle into Ubud; leave the first evening free.', 'Explore rice terraces, a cooking session and a temple outing with a local host.', 'Transfer to the coast for villa downtime and a sunset walk.'] },
  { id: 'bali-slow-living', destinationSlug: 'bali', packageName: 'Bali Slow Living', priceValue: 2490, nights: 9, pace: 'Relaxed', stay: 'Longer-stay garden retreat + private villa', summary: 'Fewer scheduled outings, two extra nights and time for wellness or independent exploring.', route: ['Unpack in a garden retreat and ease into slow breakfasts.', 'Choose one cultural outing, then keep open days for a spa or cafe walk.', 'Finish with a longer villa stay and flexible beach afternoons.'] },
  { id: 'barefoot-blue', destinationSlug: 'maldives', packageName: 'Barefoot Blue', priceValue: 3180, nights: 6, pace: 'Relaxed', stay: 'Beach villa with breakfast and dinner', summary: 'One island base, beach-villa simplicity and a guided reef outing.', route: ['Connect to the island transfer and settle into a beach villa.', 'Combine a guided reef outing with unscheduled pool and beach days.', 'Take a shared sunset cruise before a buffered airport transfer.'] },
  { id: 'lagoon-retreat', destinationSlug: 'maldives', packageName: 'Lagoon Retreat', priceValue: 4290, nights: 7, pace: 'Relaxed', stay: 'Overwater villa with three daily meals', summary: 'A lagoon-facing upgrade, an extra night and more meals included in the sample price.', route: ['Transfer to the island and check into a lagoon-facing villa.', 'Leave long stretches free, with one guided snorkelling session.', 'Enjoy a sunset outing and an easy final morning before departure.'] },
  { id: 'cities-seasons', destinationSlug: 'japan', packageName: 'Cities & Seasons', priceValue: 2790, nights: 9, pace: 'Balanced', stay: 'Tokyo neighbourhood hotel + Kyoto courtyard stay', summary: 'A first Japan journey with one intercity train and guided introductions in each city.', route: ['Discover Tokyo neighbourhoods and a guided food evening.', 'Travel to Kyoto by train with a free arrival afternoon.', 'Explore temple lanes and choose a seasonal garden or market walk.'] },
  { id: 'japan-food-trails', destinationSlug: 'japan', packageName: 'Japan Food Trails', priceValue: 3290, nights: 11, pace: 'Active', stay: 'Tokyo, Kyoto and Osaka city hotels', summary: 'An extra city, two food experiences and a fuller schedule for curious walkers.', route: ['Start in Tokyo with markets, neighbourhood walks and a food experience.', 'Continue to Kyoto for heritage lanes and an optional cooking session.', 'Finish in Osaka with another food walk and independent evenings.'] },
  { id: 'alpine-lines', destinationSlug: 'switzerland', packageName: 'Alpine Lines', priceValue: 3040, nights: 7, pace: 'Balanced', stay: 'Lakeside boutique stay + alpine village lodge', summary: 'A rail-led introduction with two bases and one flexible mountain day.', route: ['Settle beside a lake and take an easy town walk.', 'Travel a scenic rail section and continue to an alpine village.', 'Choose a mountain outing or lower-altitude alternative before departure.'] },
  { id: 'swiss-lake-days', destinationSlug: 'switzerland', packageName: 'Swiss Lake Days', priceValue: 2890, nights: 8, pace: 'Relaxed', stay: 'Two lake-town hotels near rail stations', summary: 'Less changing trains, more lake walks and free afternoons; mountain lifts are optional.', route: ['Begin in a lake town with an unhurried arrival and waterfront walk.', 'Move to a second rail-connected base and take a local boat outing.', 'Keep free days for cafes, easy trails or an optional mountain excursion.'] },
  { id: 'city-sand', destinationSlug: 'thailand', packageName: 'City & Sand', priceValue: 1990, nights: 8, pace: 'Balanced', stay: 'Bangkok riverside hotel + island garden bungalow', summary: 'Food-led city discovery followed by a contrasting beach base.', route: ['Explore Bangkok with a guided food walk and river neighbourhood time.', 'Take a domestic connection to your sample island base.', 'Enjoy open beach days and one optional local outing.'] },
  { id: 'northern-discovery', destinationSlug: 'thailand', packageName: 'Northern Discovery', priceValue: 2290, nights: 9, pace: 'Active', stay: 'Bangkok hotel + northern boutique retreat', summary: 'Swap the beach finish for crafts, cooking and a fuller northern itinerary.', route: ['Ease into Bangkok with markets and a hosted food experience.', 'Connect north for craft villages and a local cooking session.', 'Mix walking outings with a free final day at your boutique base.'] },
  { id: 'lisbon-coast', destinationSlug: 'portugal', packageName: 'Lisbon & Coast', priceValue: 2190, nights: 7, pace: 'Balanced', stay: 'Lisbon guesthouse + Atlantic coastal inn', summary: 'A neighbourhood-led city stay, a Sintra outing and a coastal finish.', route: ['Settle in Lisbon and join a neighbourhood food walk.', 'Take a hosted Sintra outing with time to explore at your own pace.', 'Transfer to a coastal inn for walks, long lunches and free afternoons.'] },
  { id: 'portugal-at-your-pace', destinationSlug: 'portugal', packageName: 'Portugal at Your Pace', priceValue: 2390, nights: 9, pace: 'Relaxed', stay: 'Longer city stay + quieter coastal guesthouse', summary: 'Two additional nights, fewer timed outings and more room for independent discoveries.', route: ['Start with a local orientation and independent Lisbon afternoons.', 'Choose a day trip or stay local for markets and food stops.', 'Slow down at a coastal base with flexible walks and an open final day.'] },
];

export const packages: TravelPackage[] = packageSeeds.map(seed => {
  const destination = getDestination(seed.destinationSlug);
  if (!destination) throw new Error(`Unknown package destination: ${seed.destinationSlug}`);
  return {
    ...destination,
    id: seed.id,
    packageName: seed.packageName,
    priceValue: seed.priceValue,
    price: `$${seed.priceValue.toLocaleString('en-US')}`,
    nights: seed.nights,
    days: `${seed.nights} nights`,
    pace: seed.pace,
    stay: seed.stay,
    summary: seed.summary,
    included: [
      `${seed.nights} nights in the illustrated stay category`,
      seed.destinationSlug === 'maldives' ? 'Return island transfers and the stated meal plan' : 'Breakfast and the transfers described in the sample itinerary',
      'Hosted experiences specifically listed in the itinerary',
      'A sample trip briefing and flexible free-time suggestions',
    ],
    excluded: ['International flights and travel insurance', 'Entry documents, local taxes and fees unless quoted', 'Optional experiences, meals and upgrades not listed'],
    itinerary: seed.route.map((description, index) => ({
      stage: ['Arrival', 'Discover', 'Unwind'][index],
      title: ['Find your bearings', 'The heart of the journey', 'Make room for yourself'][index],
      description,
    })),
  };
});

const catalogKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function getPackage(idOrName: string) {
  const key = catalogKey(idOrName);
  return packages.find(pack => pack.id === key || catalogKey(pack.packageName) === key);
}

export function getPackagesForDestination(slug: string) {
  return packages.filter(pack => pack.slug === slug);
}

export function filterDestinations(search: string, mood: string) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return destinations.filter(destination => {
    const searchable = [destination.name, destination.country, destination.tagline, destination.description, destination.bestFor, ...destination.vibe, ...destination.highlights, ...destination.stayStyles.map(stay => `${stay.name} ${stay.description}`)].join(' ').toLowerCase();
    return (mood === 'All' || destination.vibe.includes(mood)) && words.every(word => searchable.includes(word));
  });
}

export function filterPackages(destinationSlug: string, pace: string, maxPrice: number) {
  return packages.filter(pack =>
    (destinationSlug === 'all' || pack.slug === destinationSlug) &&
    (pace === 'All' || pack.pace === pace) &&
    pack.priceValue <= maxPrice,
  );
}

export function getBookingSelection(destinationSlug?: string, packageId?: string) {
  const pack = packageId ? getPackage(packageId) : undefined;
  if (packageId && !pack) return undefined;
  if (pack && destinationSlug && pack.slug !== destinationSlug) return undefined;
  const destination = getDestination(destinationSlug || pack?.slug || 'maldives');
  return destination ? { destination, pack } : undefined;
}
