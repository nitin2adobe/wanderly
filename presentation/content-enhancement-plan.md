# Wanderly content and realistic demo flow plan

## Goal and boundaries

Turn the thin storefront into a browsable fictional travel marketplace with meaningful
choices, practical questions and a complete local planning flow. Preserve the existing
rules, AI proposal and execution-policy behavior; emit events for genuine page views and
visitor actions, not artificial assistance triggers.

All catalog prices, seasonal guidance, stays and itineraries are illustrative.
There is no live inventory, payment, reservation, or transmission of a booking request.
New website content does not automatically update Adobe Concierge's external knowledge.

## Implementation

1. **Widen the catalog:** retain Bali, Maldives, Japan and Switzerland; add Thailand
   and Portugal. Give each destination two distinctly priced and paced package choices.
   Preserve existing package names/prices and add stable package IDs.
2. **Make choices meaningful:** add destination fit, trade-offs, seasonal planning,
   transfer considerations, stay styles and itinerary outlines. Extend comparison
   beyond mood and headline price.
3. **Connect browsing:** functional destination search and mood filters, package
   filters, dedicated itinerary pages, relevant next links and related alternatives.
   Keep destination/package context when opening the planning form.
4. **Answer actual questions:** destination-specific practical guidance and accessible
   FAQ accordions with complete answers. Track openings rather than inert list clicks.
5. **Finish the demo flow:** validate destination/package/date/traveller choices,
   show a request summary and prepare a clearly labelled local preview.
   Do not emit BOOKING_COMPLETE for a request preview that is not a real booking.
6. **Validate:** catalog/route/filter consistency tests, existing decisioning tests,
   typecheck/build and representative browser journeys at desktop/mobile widths.

## Presenter journeys

Start a fresh session in `/agent` between stories. Use rules mode for deterministic
timing; Adobe loading/submission and live AI still depend on their existing configuration.
Pause briefly after the last browsing action so the debounced policy can evaluate.

| Story | Visitor flow | What to observe |
|---|---|---|
| Island indecision | Bali -> Maldives -> Bali -> add both to comparison -> Compare -> Maldives | Repeated switching/comparison can offer destination assistance |
| Package trade-off | Bali -> Island Rhythm -> Bali Slow Living -> Island Rhythm | Prices plus package backtracking can offer package-selection assistance |
| Practical uncertainty | Japan -> Travel info -> open entry, luggage and transfer FAQs | Repeated genuine information seeking can offer practical assistance |
| Decisive traveller | Portugal -> Lisbon & Coast -> Check dates -> complete planning fields -> prepare demo request | Forward progress should suppress proactive interruption |
| Respectful adaptation | Trigger the island story, close chat, then keep browsing | The same assistance type should not repeat under the existing policy |
| New discovery | Search for food/culture -> Thailand -> compare with Japan -> inspect packages | Richer content supports exploratory browsing without forcing assistance |

## Acceptance

- Six destination routes and twelve unique package routes resolve.
- Every package belongs to a real catalog destination and uses consistent identity,
  pricing, duration and booking links.
- Filters and empty states work; FAQ controls are keyboard-accessible.
- Package entry tracks PACKAGE_VIEW and PRICE_VIEW even from a direct URL.
- Mere booking-page arrival is not BOOKING_START; genuine form interaction is.
- Request preparation makes no network request and collects no contact/payment data.
- Existing assistance tests pass without retuning the engine.
