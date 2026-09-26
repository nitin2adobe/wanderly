import type { WanderlyEvent } from './events.ts';
export { validateJourneyContext } from './assistance-schema.ts';

export type SignalLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type Progression = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';
export type Friction = 'NONE' | 'DESTINATION_SELECTION' | 'PACKAGE_SELECTION' | 'TRAVEL_INFORMATION';

export type JourneyContext = {
  destinationsViewed: string[];
  packagesViewed: string[];
  destinationSwitches: number;
  destinationSwitching: SignalLevel;
  comparisonActivity: SignalLevel;
  pricingExploration: SignalLevel;
  informationSeeking: SignalLevel;
  bookingProgression: SignalLevel;
  journeyProgression: Progression;
  potentialFriction: Friction;
  recentJourney: string[];
  semanticEventCount: number;
};

const meaningful = (e: WanderlyEvent) => !['PAGE_VIEW','SESSION_START'].includes(e.eventType);
const level = (n:number, medium=1, high=2): SignalLevel => n >= high ? 'HIGH' : n >= medium ? 'MEDIUM' : n > 0 ? 'LOW' : 'NONE';
const title = (v:string) => v.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

export function buildJourneyContext(events: WanderlyEvent[]): JourneyContext {
  const semantic = events.filter(meaningful);
  const destinationEvents = semantic.filter(e=>e.eventType==='DESTINATION_VIEW' && e.entity);
  const destinationsViewed = [...new Set(destinationEvents.map(e=>title(e.entity!)))];
  const packagesViewed = [...new Set(semantic.filter(e=>e.eventType==='PACKAGE_VIEW'&&e.entity).map(e=>title(e.entity!)))];

  let switches = 0;
  for(let i=1;i<destinationEvents.length;i++) if(destinationEvents[i-1].entity!==destinationEvents[i].entity) switches++;

  const compareCount = semantic.filter(e=>['COMPARE_ADD','COMPARE_VIEW','COMPARE_REMOVE'].includes(e.eventType)).length;
  const priceCount = semantic.filter(e=>e.eventType==='PRICE_VIEW').length;
  const infoCount = semantic.filter(e=>['TRAVEL_INFO_VIEW','FAQ_SEARCH'].includes(e.eventType)).length;
  const booking = semantic.filter(e=>['BOOKING_START','BOOKING_STEP','BOOKING_COMPLETE'].includes(e.eventType));

  const lastTypes = semantic.slice(-4).map(e=>e.eventType);
  let journeyProgression: Progression = 'NEUTRAL';
  if(lastTypes.some(t=>['BOOKING_START','BOOKING_STEP','BOOKING_COMPLETE'].includes(t))) journeyProgression='POSITIVE';
  else if(switches >= 3 && compareCount===0) journeyProgression='NEGATIVE';
  else if(compareCount>0 && destinationEvents.length>0) {
    const lastCompare = semantic.map(e=>e.eventType).lastIndexOf('COMPARE_VIEW');
    const afterCompare = semantic.slice(lastCompare+1);
    if(afterCompare.some(e=>['DATE_SEARCH','BOOKING_START','BOOKING_STEP','BOOKING_COMPLETE'].includes(e.eventType))) journeyProgression='POSITIVE';
  }

  let potentialFriction: Friction = 'NONE';
  if(infoCount>=2) potentialFriction='TRAVEL_INFORMATION';
  else if(priceCount>=2 || packagesViewed.length>=2) potentialFriction='PACKAGE_SELECTION';
  else if(switches>=2 || (destinationsViewed.length>=2 && compareCount>0)) potentialFriction='DESTINATION_SELECTION';

  const recentJourney = semantic.slice(-8).map(e=>e.entity ? `${e.eventType}: ${title(e.entity)}` : e.eventType);

  return {
    destinationsViewed,
    packagesViewed,
    destinationSwitches:switches,
    destinationSwitching: level(switches,1,3),
    comparisonActivity: level(compareCount,1,2),
    pricingExploration: level(priceCount,1,2),
    informationSeeking: level(infoCount,1,2),
    bookingProgression: booking.some(e=>e.eventType==='BOOKING_COMPLETE')?'HIGH':booking.some(e=>e.eventType==='BOOKING_STEP')?'MEDIUM':booking.some(e=>e.eventType==='BOOKING_START')?'LOW':'NONE',
    journeyProgression,
    potentialFriction,
    recentJourney,
    semanticEventCount:semantic.length
  };
}
