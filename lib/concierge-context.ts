import { destinations, getBookingSelection, getDestination, getPackage } from './data.ts';
import type { ConciergeHandoff } from './concierge-handoff.ts';
import type { WanderlyEvent } from './events.ts';
import { travelFaqs } from './travel-info.ts';
import { conciergeOpeningMessage } from './concierge-message.ts';
import { deriveMemory } from './assistance-memory.ts';

export function conciergePageDestination(pathname: string, search = '') {
  if (pathname === '/booking') return bookingPageSelection(search)?.destination;
  const destinationSlug = pathname.startsWith('/destinations/') ? pathname.slice('/destinations/'.length) :
    pathname.startsWith('/packages/') ? getPackage(pathname.slice('/packages/'.length))?.slug :
    pathname === '/travel-info' ? new URLSearchParams(search).get('destination') ?? 'japan' :
    pathname === '/packages' ? new URLSearchParams(search).get('destination') : undefined;
  return getDestination(destinationSlug ?? '');
}

function bookingPageSelection(search: string) {
  const params = new URLSearchParams(search);
  const destination = params.getAll('destination');
  const pack = params.getAll('package');
  return getBookingSelection(destination.length === 1 ? destination[0] : undefined, pack.length === 1 ? pack[0] : undefined);
}

function bookingEventSelection(event: WanderlyEvent) {
  if (event.page.split('?')[0] !== '/booking' || (event.eventType !== 'BOOKING_START' && event.eventType !== 'BOOKING_STEP')) return;
  const destination = event.metadata?.destinationSlug;
  const pack = event.metadata?.packageId;
  if (typeof destination !== 'string' || !getDestination(destination) || (pack !== undefined && typeof pack !== 'string')) return;
  return getBookingSelection(destination, pack);
}

type QuestionContext = Pick<ConciergeHandoff, 'brand' | 'intent' | 'entities' | 'topic'>;

function contextualQuestion(handoff: QuestionContext, events: WanderlyEvent[], shortlist: string[], currentDestination?: string): QuestionContext {
  if (handoff.brand !== 'wanderly') return handoff;
  const active = getDestination(currentDestination ?? '');
  const recent = [...events].reverse();
  const destinationNames = (slugs: (string | undefined)[]) => [...new Set(slugs.map(slug => slug ? getDestination(slug)?.name : undefined).filter((name): name is string => !!name))].slice(0, 3);
  if (handoff.intent === 'PACKAGE_SELECTION') {
    const entities = [...new Set(recent.filter(event => event.eventType === 'PACKAGE_VIEW').map(event => getPackage(event.entity ?? '')).filter(pack => pack && (!active || pack.slug === active.slug)).map(pack => pack?.packageName).filter((name): name is string => !!name))].slice(0, 3);
    return { ...handoff, entities };
  }
  if (handoff.intent === 'TRAVEL_INFORMATION') {
    for (const event of recent) {
      if (event.eventType === 'FAQ_SEARCH') {
        const destination = getDestination(event.entity?.split('-')[0] ?? '');
        const faq = destination && travelFaqs(destination).find(item => `${destination.slug}-${item.id}` === event.entity);
        if (destination && faq && (!active || destination.slug === active.slug)) return { ...handoff, entities: [destination.name], topic: faq.question };
      }
      if (event.eventType === 'TRAVEL_INFO_VIEW' && getDestination(event.entity ?? '') && (!active || event.entity === active.slug)) {
        return { ...handoff, entities: destinationNames([event.entity]), topic: undefined };
      }
    }
  }
  const entities = active ? [active.name] : destinationNames(shortlist.length ? shortlist : recent.filter(event => event.eventType === 'DESTINATION_VIEW').map(event => event.entity));
  return { ...handoff, entities, topic: undefined };
}

export function contextualHandoff(handoff: ConciergeHandoff, events: WanderlyEvent[], shortlist: string[] = [], currentDestination?: string): ConciergeHandoff {
  return { ...handoff, ...contextualQuestion(handoff, events, shortlist, currentDestination) };
}

function eventDestination(event: WanderlyEvent) {
  if (event.eventType === 'PACKAGE_VIEW' || event.eventType === 'PRICE_VIEW') return getDestination(getPackage(event.entity ?? '')?.slug ?? '');
  if (event.eventType === 'DESTINATION_VIEW' || event.eventType === 'TRAVEL_INFO_VIEW') return getDestination(event.entity ?? '');
  if (event.eventType === 'FAQ_SEARCH') {
    const destination = getDestination(event.entity?.split('-')[0] ?? '');
    return destination && travelFaqs(destination).some(faq => `${destination.slug}-${faq.id}` === event.entity) ? destination : undefined;
  }
  if (event.eventType === 'HOTEL_VIEW') return destinations.find(destination => destination.stayStyles.some(stay => stay.name === event.entity));
}

export function defaultConciergeWelcomeExamples(): string[] {
  return destinations.map(destination => `Help me explore ${destination.name}.`);
}

function contextualWelcomeExamples(context: QuestionContext, destinationSlug?: string): string[] {
  const destination = getDestination(destinationSlug ?? '');
  const packs = context.intent === 'PACKAGE_SELECTION' ? context.entities.map(getPackage).filter(pack => pack && (!destination || pack.slug === destination.slug)) : [];
  if (packs.length) return packs.flatMap(pack => pack ? [
    `What is included in ${pack.packageName} in ${pack.name}?`,
    `How is the itinerary paced for ${pack.packageName} in ${pack.name}?`,
  ] : []).slice(0, 3);
  if (context.intent === 'DESTINATION_COMPARISON' && context.entities.length > 1) {
    const places = context.entities.join(' and ');
    return [`Compare stay styles and transfers for ${places}.`, `How do the sample trip lengths differ for ${places}?`, `Which experiences distinguish ${places}?`];
  }
  if (destination) return [
    `Which sample journeys fit a trip to ${destination.name}?`,
    ...travelFaqs(destination).slice(0, 2).map(faq => `For ${destination.name}: ${faq.question}`),
  ];
  return [];
}

/** Uses approved catalog signals only. Callers supply the current session's events. */
export function manualConciergeSuggestion(events: WanderlyEvent[], pathname: string, search = '', shortlist: string[] = []) {
  const recent = events.filter(event => !event.eventType.startsWith('ASSISTANCE_') && event.eventType !== 'PAGE_VIEW' && event.eventType !== 'SESSION_START').slice(-8).reverse();
  const pageDestination = conciergePageDestination(pathname, search);
  const pageStart = events.findLastIndex(event => event.eventType === 'PAGE_VIEW' && event.page.split('?')[0] === pathname);
  const visit = pageStart < 0 ? events : events.slice(pageStart + 1);
  const pageBooking = pathname === '/booking' ? bookingPageSelection(search) : undefined;
  if (pathname === '/booking' && !pageBooking) return;
  const booking = pageBooking ? visit.map(bookingEventSelection).findLast(selection => !!selection) ?? pageBooking : undefined;
  const selectedDestinations = [...new Set(shortlist)].map(getDestination).filter(destination => !!destination).slice(0, 3);
  const currentInfo = pathname === '/travel-info' ? visit.filter(event => !event.eventType.startsWith('ASSISTANCE_')).slice(-8).reverse() : recent;
  const selectedInfo = pathname === '/travel-info' ? currentInfo.find(event => (event.eventType === 'TRAVEL_INFO_VIEW' || event.eventType === 'FAQ_SEARCH') && event.page.split('?')[0] === pathname && eventDestination(event)) : undefined;
  const destination = booking?.destination ?? (selectedInfo ? eventDestination(selectedInfo) : pageDestination ?? (pathname !== '/compare' ? recent.map(eventDestination).find(Boolean) : undefined));
  const activity = currentInfo.find(event => {
    if (event.eventType.startsWith('COMPARE_')) return pathname === '/compare' || selectedDestinations.length > 0;
    const known = eventDestination(event);
    return event.eventType !== 'DESTINATION_VIEW' && known && (!destination || known.slug === destination.slug);
  });
  const intent: ConciergeHandoff['intent'] = booking ? 'PACKAGE_SELECTION' : pathname === '/compare' || activity?.eventType.startsWith('COMPARE_') ? 'DESTINATION_COMPARISON' :
    activity?.eventType === 'PACKAGE_VIEW' || activity?.eventType === 'PRICE_VIEW' || pathname.startsWith('/packages') ? 'PACKAGE_SELECTION' : 'TRAVEL_INFORMATION';
  const comparison = intent === 'DESTINATION_COMPARISON' && !pageDestination;
  const context: QuestionContext = booking ? { brand: 'wanderly', intent, entities: booking.pack ? [booking.pack.packageName] : [] } :
    comparison ? { brand: 'wanderly', intent, entities: selectedDestinations.map(destination => destination.name) } :
    contextualQuestion({ brand: 'wanderly', intent, entities: [] }, [...currentInfo].reverse(), shortlist, destination?.slug);
  const scopedDestination = comparison ? selectedDestinations.length === 1 ? selectedDestinations[0] : undefined : destination;
  const stay = activity?.eventType === 'HOTEL_VIEW' ? destination?.stayStyles.find(item => item.name === activity.entity) : undefined;
  if (stay) context.topic = `What should I check about the ${stay.name} stay style?`;
  const { preferredPriority } = deriveMemory(events);
  if (!scopedDestination && !context.entities.length && !preferredPriority) return;
  return {
    initialMessage: conciergeOpeningMessage({ ...context, explicitPreferences: preferredPriority ? { priority: preferredPriority } : {} }, scopedDestination ? [scopedDestination.name] : []),
    welcomeExamples: contextualWelcomeExamples(context, scopedDestination?.slug),
    explanation: `${booking ? 'Based on your current trip selection' : !scopedDestination && !context.entities.length && preferredPriority ? 'Based on the priority you explicitly chose' : stay ? 'Based on the stay details you opened' : activity?.eventType === 'FAQ_SEARCH' ? 'Based on the practical question you opened' : intent === 'PACKAGE_SELECTION' ? 'Based on your recent package and price views' : intent === 'DESTINATION_COMPARISON' ? 'Based on your comparison activity' : 'Based on your recent browsing'}${scopedDestination ? ` for ${scopedDestination.name}` : ''}. Choose the question if shown in chat, or copy it into your existing conversation; nothing is submitted automatically.`,
  };
}
