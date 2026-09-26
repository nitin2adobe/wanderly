import type { WanderlyEvent, WanderlyEventType } from './events.ts';

export type LabelledJourney = {
  id: string;
  name: string;
  description: string;
  events: Array<[WanderlyEventType, string?]>;
  expectedDecision: 'SILENT' | 'WAIT' | 'ASSIST';
  expectedAssistanceType?: 'NONE' | 'DESTINATION_COMPARISON' | 'PACKAGE_SELECTION' | 'TRAVEL_INFORMATION';
  rationale: string;
  category: 'HEALTHY_PROGRESSION' | 'DESTINATION_COMPARISON' | 'PACKAGE_SELECTION' | 'INFORMATION_SEEKING' | 'AMBIGUOUS' | 'FALSE_POSITIVE_TRAP' | 'DISENGAGEMENT';
  labelConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const d = (id: string, name: string, description: string, events: LabelledJourney['events'], expectedDecision: LabelledJourney['expectedDecision'], rationale: string, category: LabelledJourney['category'], labelConfidence: LabelledJourney['labelConfidence'] = 'HIGH', expectedAssistanceType: LabelledJourney['expectedAssistanceType'] = 'NONE'): LabelledJourney => ({
  id, name, description, events, expectedDecision, expectedAssistanceType, rationale, category, labelConfidence,
});

export const labelledJourneys: LabelledJourney[] = [
  d('healthy-maldives-booking', 'Direct Maldives booking', 'A short, decisive path from destination to booking.', [['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'Clear forward progression means interruption adds cost.', 'HEALTHY_PROGRESSION'),
  d('healthy-japan-booking', 'Focused Japan planning', 'The visitor views Japan, a package, and starts booking.', [['DESTINATION_VIEW', 'japan'], ['PACKAGE_VIEW', 'cities-seasons'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'Activity is coherent and moves toward booking.', 'HEALTHY_PROGRESSION'),
  d('healthy-switzerland-details', 'Alpine details then dates', 'High activity remains within one destination and ends with dates.', [['DESTINATION_VIEW', 'switzerland'], ['HOTEL_VIEW', 'alpine-stay'], ['PRICE_VIEW'], ['TRAVEL_INFO_VIEW', 'rail'], ['DATE_SEARCH']], 'SILENT', 'High activity is healthy when it supports progression.', 'HEALTHY_PROGRESSION'),
  d('healthy-package-booking', 'Package selected directly', 'Package exploration ends in booking without comparison.', [['DESTINATION_VIEW', 'bali'], ['PACKAGE_VIEW', 'island-rhythm'], ['PRICE_VIEW'], ['BOOKING_START']], 'SILENT', 'The visitor appears to have selected a path independently.', 'HEALTHY_PROGRESSION'),
  d('healthy-repeat-destination', 'Return to chosen destination', 'The visitor briefly revisits a chosen destination before dates.', [['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'Repeated viewing without switching is not evidence of friction.', 'HEALTHY_PROGRESSION'),

  d('compare-bali-maldives-loop', 'Unresolved island comparison', 'Repeated switching precedes comparison with no forward progress.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW']], 'ASSIST', 'Backtracking plus comparison suggests an unresolved destination choice.', 'DESTINATION_COMPARISON', 'HIGH', 'DESTINATION_COMPARISON'),
  d('compare-three-destinations', 'Three-way destination choice', 'The visitor cycles through three destinations and compares them.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'japan'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW']], 'ASSIST', 'Broad switching and comparison create a strong contextual-help opportunity.', 'DESTINATION_COMPARISON', 'HIGH', 'DESTINATION_COMPARISON'),
  d('compare-bali-maldives-wait', 'Early Bali Maldives comparison', 'Two destinations and one compare action, but little repetition.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW']], 'WAIT', 'Comparison is explicit but evidence of unresolved need is limited.', 'DESTINATION_COMPARISON'),
  d('compare-resolved-dates', 'Resolved comparison with dates', 'Comparison is followed by a date search.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH']], 'SILENT', 'Date selection indicates the comparison was likely resolved.', 'FALSE_POSITIVE_TRAP'),
  d('compare-resolved-booking', 'Resolved comparison with booking', 'A comparison is followed by booking progression.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'Booking progression outweighs earlier comparison activity.', 'FALSE_POSITIVE_TRAP'),
  d('compare-switch-after-compare', 'Switching remains unresolved', 'The visitor keeps switching after seeing comparison content.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'switzerland']], 'ASSIST', 'Post-comparison switching is strong evidence the decision remains open.', 'DESTINATION_COMPARISON', 'HIGH', 'DESTINATION_COMPARISON'),

  d('package-two-wait', 'Two packages, no price', 'Two packages are viewed without pricing or comparison.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PACKAGE_VIEW', 'barefoot-blue']], 'WAIT', 'There may be selection uncertainty, but evidence is weak.', 'PACKAGE_SELECTION'),
  d('package-price-wait', 'Early pricing exploration', 'Pricing is inspected twice while exploring one package.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'], ['HOTEL_VIEW', 'resort'], ['PRICE_VIEW']], 'WAIT', 'Pricing activity alone does not establish enough friction.', 'PACKAGE_SELECTION'),
  d('package-compare-assist', 'Package comparison friction', 'Pricing exploration culminates in comparison.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'], ['HOTEL_VIEW', 'resort'], ['PRICE_VIEW'], ['COMPARE_VIEW']], 'ASSIST', 'Repeated pricing plus comparison suggests package-selection uncertainty.', 'PACKAGE_SELECTION', 'HIGH', 'PACKAGE_SELECTION'),
  d('package-progress-booking', 'Package pricing then booking', 'The visitor checks price and proceeds to booking.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'Pricing supports a successful forward journey.', 'PACKAGE_SELECTION'),
  d('package-backtrack', 'Package backtracking', 'The visitor alternates between packages and price views without booking.', [['DESTINATION_VIEW', 'bali'], ['PACKAGE_VIEW', 'island-rhythm'], ['PRICE_VIEW'], ['PACKAGE_VIEW', 'cities-seasons'], ['PRICE_VIEW'], ['PACKAGE_VIEW', 'island-rhythm']], 'ASSIST', 'Backtracking across packages suggests unresolved selection.', 'PACKAGE_SELECTION', 'MEDIUM', 'PACKAGE_SELECTION'),

  d('info-japan-visa', 'Japan visa information', 'Repeated entry-information seeking follows a Japan view.', [['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW', 'visa'], ['FAQ_SEARCH', 'visa'], ['TRAVEL_INFO_VIEW', 'entry-requirements']], 'ASSIST', 'Explicit repeated information seeking is strong assistance evidence.', 'INFORMATION_SEEKING', 'HIGH', 'TRAVEL_INFORMATION'),
  d('info-japan-single', 'Single travel-information visit', 'The visitor opens travel information once.', [['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW', 'visa']], 'WAIT', 'A single information visit may be self-service and needs more evidence.', 'INFORMATION_SEEKING'),
  d('info-faq-resolved', 'FAQ resolves question', 'A travel-info view is followed by one FAQ and then dates.', [['DESTINATION_VIEW', 'switzerland'], ['TRAVEL_INFO_VIEW', 'rail'], ['FAQ_SEARCH', 'transfers'], ['DATE_SEARCH']], 'SILENT', 'Information seeking appears resolved and the journey progresses.', 'INFORMATION_SEEKING'),
  d('info-repeated-faq', 'Repeated entry FAQs', 'Several entry questions are explored without booking.', [['DESTINATION_VIEW', 'japan'], ['FAQ_SEARCH', 'visa'], ['FAQ_SEARCH', 'passport'], ['TRAVEL_INFO_VIEW', 'entry-requirements']], 'ASSIST', 'Repeated explicit questions indicate unresolved information need.', 'INFORMATION_SEEKING', 'HIGH', 'TRAVEL_INFORMATION'),
  d('info-helpful-then-book', 'Information then booking', 'The visitor checks requirements and starts booking.', [['DESTINATION_VIEW', 'bali'], ['TRAVEL_INFO_VIEW', 'entry'], ['FAQ_SEARCH', 'insurance'], ['BOOKING_START']], 'SILENT', 'Forward booking progression indicates independent resolution.', 'INFORMATION_SEEKING'),

  d('ambiguous-three-switches', 'Three destination switches', 'Switching is high but there is no explicit comparison.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'japan'], ['DESTINATION_VIEW', 'bali']], 'WAIT', 'Switching may be exploratory rather than friction; human label is medium confidence.', 'AMBIGUOUS', 'MEDIUM'),
  d('ambiguous-bali-maldives-switzerland', 'Three destinations once each', 'The visitor samples three destinations with no clear next step.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'switzerland']], 'WAIT', 'Intent is unclear and there is insufficient evidence to interrupt.', 'AMBIGUOUS', 'MEDIUM'),
  d('ambiguous-price-single', 'One price check', 'One package price is checked after a destination view.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW']], 'WAIT', 'A normal evaluation step and a friction signal are indistinguishable here.', 'AMBIGUOUS', 'LOW'),
  d('ambiguous-info-switch', 'Information then destination switch', 'Information seeking is followed by a destination change.', [['DESTINATION_VIEW', 'japan'], ['TRAVEL_INFO_VIEW', 'visa'], ['DESTINATION_VIEW', 'bali']], 'WAIT', 'The switch could reflect resolved research or uncertainty.', 'AMBIGUOUS', 'LOW'),

  d('disengage-after-assist', 'Repeated activity then stop', 'The visitor loops through destinations and stops without booking.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['DESTINATION_VIEW', 'bali'], ['COMPARE_VIEW']], 'ASSIST', 'Current unresolved friction warrants one evaluation opportunity; dismissal policy is future work.', 'DISENGAGEMENT', 'MEDIUM', 'DESTINATION_COMPARISON'),
  d('disengage-low-signal', 'Single destination exit', 'The visitor views one destination and leaves.', [['DESTINATION_VIEW', 'japan']], 'SILENT', 'There is no meaningful assistance signal.', 'DISENGAGEMENT'),
  d('disengage-after-package-loop', 'Package loop then exit', 'The visitor alternates packages and prices, then stops.', [['DESTINATION_VIEW', 'maldives'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'], ['PACKAGE_VIEW', 'island-rhythm'], ['PRICE_VIEW']], 'WAIT', 'Selection uncertainty exists, but the labelled evidence is not strong enough without comparison.', 'DISENGAGEMENT', 'MEDIUM'),

  d('trap-high-activity-booking', 'High activity but booking', 'Many exploration events culminate in booking.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['PACKAGE_VIEW', 'barefoot-blue'], ['PRICE_VIEW'], ['TRAVEL_INFO_VIEW', 'visa'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'High activity is not friction when it ends in clear progression.', 'FALSE_POSITIVE_TRAP'),
  d('trap-compare-dates-booking', 'Hero false-positive journey', 'Bali, Maldives, comparison, selected dates, and booking.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['DESTINATION_VIEW', 'maldives'], ['DATE_SEARCH'], ['BOOKING_START']], 'SILENT', 'The comparison was resolved and the visitor is progressing toward booking.', 'FALSE_POSITIVE_TRAP'),
  d('assist-explicit-compare', 'Explicit comparison without loops', 'The visitor explicitly compares two destinations and remains on comparison.', [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['COMPARE_ADD', 'bali'], ['COMPARE_ADD', 'maldives']], 'ASSIST', 'Explicit comparison without forward progress is a useful assistance opportunity.', 'DESTINATION_COMPARISON', 'MEDIUM', 'DESTINATION_COMPARISON'),
];

export function journeyEvents(items: LabelledJourney['events'], index = 0): WanderlyEvent[] {
  return items.map(([eventType, entity], eventIndex) => ({
    id: `label-${index}-${eventIndex}`,
    sessionId: `label-session-${index}`,
    timestamp: new Date((eventIndex + 1) * 1000).toISOString(),
    eventType,
    page: '/',
    entity,
  }));
}
