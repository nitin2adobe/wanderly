# Wanderly — Step 1 UI

A fictional premium travel marketplace for the Adaptive Assistance Agent POC.

## Included routes
- `/` Home
- `/destinations`
- `/destinations/bali`
- `/destinations/maldives`
- `/destinations/japan`
- `/destinations/switzerland`
- `/destinations/thailand`
- `/destinations/portugal`
- `/packages`
- `/packages/[slug]` Sample itinerary details (12 package routes)
- `/compare`
- `/travel-info`
- `/booking`

## Run locally
Requires Node 22.6+.

```bash
npm install
npm run dev
npm test
npm run typecheck
```

Open http://localhost:3000. Step 3 decisioning and the AI reasoner are documented in [STEP3.md](STEP3.md).

## Richer customer demo

The homepage **New session** button closes the chat window, clears only the
current Wanderly session's browsing events and comparison, and starts a fresh
tracked session without reloading. Other sessions and activation/policy settings
are preserved. Adobe conversation history is not deleted.

The storefront includes six destinations and two sample packages per destination.
Search places/experiences, filter packages by destination/pace/budget, compare
practical trade-offs, inspect fictional stay styles, and read destination-specific
FAQ answers. Package detail routes record package/pricing views, including direct
URL entry; opening stay details records `HOTEL_VIEW`.

Destination and package links carry the selected trip into `/booking`. The form
validates a preferred departure date and prepares a local request preview after
review. It sends no request, collects no contact/payment data, and does not reserve
dates. Preparing the preview records `BOOKING_STEP`, not `BOOKING_COMPLETE`.
Opening the form alone still does not start booking progression.

All prices, stays, itineraries and seasonal guidance are illustrative. Sample
package prices assume two adults sharing and exclude international flights,
insurance and unlisted extras. Confirm actual entry requirements and provider terms
before real travel. Website content does not automatically populate Adobe
Concierge's externally configured knowledge.

The implementation plan and six manual presenter journeys are in
[the content enhancement plan](presentation/content-enhancement-plan.md).

## Step 1 scope
Step 1 was UI only; instrumentation (Step 2) and assistance decisioning (Step 3) were added later.

## Brand Concierge

On Wanderly customer pages, a policy-approved `ASSIST` decision opens the Adobe
Brand Concierge Web Client with a **suggested question, not an automatically sent
visitor message**. This intentional default change uses Adobe's documented
`arrays["welcome.examples"]` configuration and `webclient:initialized` event.
A visible Wanderly notice explains the browsing-based suggestion; the visitor
chooses whether to submit it. An unsent welcome suggestion is refreshed through
bootstrap when its question changes. Submitted conversations are preserved, with
a copy button for the updated question instead of resetting history.

Destination, package-detail and destination-filtered information pages scope
questions to the current destination only. For example, Japan pages do not reuse
an earlier Bali/Maldives comparison or Bali FAQ. An open window updates its
browsing-based question on destination navigation without automatically sending
it; the manual launcher also supplies a current-destination suggestion.
Every manual opening recomputes its suggestion from the current session's last
eight meaningful browsing signals: approved FAQ clicks, stay disclosures,
package/price views and comparison actions. Recent information-selector changes
also override an older destination URL filter. The banner explains which activity
informed the question; an explicitly chosen priority is retained. Unknown/free-form
entities and raw event history are not copied into the Adobe prompt.
No proactive `ASSIST` decision is required when the visitor opens chat themselves.
Manual chat remains available during booking progression; proactive safeguards
do not block an explicit visitor request. Closing cancels queued as well as active
opening requests, and switching activation mode cancels an obsolete automatic
opening.
Unsent welcome suggestions refresh on reopening; submitted conversations retain
their history and use the updated question banner/copy button.
Destination selectors keep the URL, visible content and concierge scope in sync,
including query-only navigation and Back. Old FAQ clicks from a previous
information-page visit cannot override a new destination URL; raw query text is
not added to the reasoning context.
On comparison and other unscoped pages, questions use active comparison selections,
otherwise the most-recent catalog
entities (maximum three); package IDs resolve to actual display names. Recognized
FAQ events carry the approved practical question rather than generic travel
wording. The primary question, approved welcome alternatives and any explicitly
chosen priority enter the SDK configuration, not raw events, policy evidence or
the local session ID.

Welcome examples are dynamic catalog/template questions, not LLM-generated text.
A fresh, unscoped session offers all six current destinations, including Thailand
and Portugal, overriding the old four-place defaults in the styling file.
Destination browsing supplies relevant journey and approved FAQ examples;
package views use actual package names, and comparisons use the trusted shortlist.
The browsing-based primary question remains first, with duplicate examples removed.
Examples are recomputed on opening/reopening and destination navigation. Changes
to secondary examples also refresh an unsent welcome, but submitted conversations
are never rebootstrapped. Same-page clicks do not continually reset an open input;
their updated examples appear on reopening. Nothing is automatically submitted.
Catalog changes reach these examples when the site is rebuilt/deployed; this does
not automatically update Adobe's external knowledge.

Both rules and AI proposals retain the same policy gate. Opening is asynchronous
and bounded: `ASSISTANCE_REQUESTED` becomes acknowledged `ASSISTANCE_OPENED`,
`ASSISTANCE_FAILED` or `ASSISTANCE_CANCELLED`. Only delivered assistance consumes
the invitation budget; failures do not count as successful handling. SDK
initialization, message submission, response completion, feedback and visitor
acceptance are distinct. A response-completed event is not proof of correctness.
Closing or progression cancels a pending local request. The Volt Electronics
fixture still has no live Adobe concierge.

The trace's **Active decision** comes from the plugin's recorded evaluation for
the current journey and selected mode (`ASSISTANCE_EVALUATED`). In AI-assisted
mode, a rules-baseline `ASSIST` does not open chat when the active AI returns
`WAIT` or `SILENT`; the trace now shows that actual decision and source. Until an
evaluation arrives it shows "Awaiting active evaluation", not the rules result.
The per-signal timeline remains explicitly labelled as the rules baseline.
The current policy gate can block further invitations after a chat has already
opened. Use **Rules** and replay a fresh **Right moment** scenario for the
deterministic chat-opening demo. AI-assisted outcomes may legitimately differ.

The demo now has five scenarios: **Right moment** (Bali/Maldives comparison),
**Choose a package** (Island Rhythm/Bali Slow Living), **Practical travel
questions** (Japan entry guidance), **Right restraint** (no proactive chat during
booking progress), and **Respectful adaptation** (no repeat after dismissal).
Comparison scenarios land on `/compare`; the others land on the relevant
customer page in Rules mode. Starting another
scenario closes the previous chat window and resets Wanderly's session, not
Adobe conversation history. Once a question has been submitted, use the updated
Wanderly question banner/copy button rather than expecting new welcome pills.
Comparison replays clear and seed the visible shortlist with their actual
destinations. Practical FAQ actions are replayed after the landing page is tracked,
so the latest-page boundary retains the intended question.

The old **undocumented** `data-initial-message` auto-submit hook is available only
with `NEXT_PUBLIC_BC_LEGACY_AUTO_SUBMIT=true` at build time. It awaits a matching
`query:submitted` event, not bootstrap return. Timeouts/cancellation may leave SDK
submission outcome unknown: the SDK has no verified public cancellation API.
Such requests are not automatically replayed; reload recovery and manual retries
do not auto-submit. Use default suggestion mode for a supported interaction path.

### Ground BC in the current catalog

The public `/concierge-knowledge` page is generated from the same destination,
package and FAQ data as the storefront, with a content-derived version, sample
price basis, inclusions/exclusions and answer guardrails. No browser journey data
is included. Publishing this page alone does **not** configure Adobe.

```powershell
npm run export:concierge-knowledge -- --base-url=https://your-approved-deployment.example
```

This writes `evaluation/results/concierge-knowledge-urls.csv` (a URL column for
Adobe's crawler) and `concierge-knowledge.json` (a local review snapshot). Include
the deployment base path in the base URL when applicable. The command performs
no network request or upload. Deploy the site, review/approve the export, upload
the CSV through **BC Knowledge Sources**, attach it to the relevant skill, and
confirm processing. Reprocess after catalog changes and compare version IDs.
Copy the answer guardrails into the concierge's reviewed instructions as needed;
retrieved content is not a replacement for configured instructions.

### Measure delivery and review answers

The activation trace shows locally observed requests, opened chat, opening/service
errors, cancellations, queries, completed responses, feedback and streaming time.
SDK conversation/interaction IDs deduplicate responses. No raw visitor query,
response text or feedback notes are added to Wanderly lifecycle telemetry.
These browser-local metrics are not a production analytics system or causal uplift.
Query callbacks have no interaction IDs: the observer attributes a new response
only when one activation is awaiting a response, then retains that mapping by SDK
IDs. Ambiguous overlapping responses are warned about and left unattributed rather
than assigned by event order. Counts can therefore be incomplete; use Adobe's
authorized conversation export for authoritative reporting.

Adobe's documented response callbacks carry IDs, not answer text. Therefore the
answer checker works on approved test answers captured manually in Preview/Tester
View or through an authorized AEP export; it does not scrape the chat DOM or invent
an SDK response-text field.

```powershell
npm run evaluate:concierge -- --list
npm run evaluate:concierge -- --input=C:\approved-test-answers.json
```

Input shape: `[{"caseId":"bali-package-comparison","responseText":"..."}]`.
Only use non-sensitive test material. The report in
`evaluation/results/concierge-answer-checks.json` stores checks, not response text.
Checks cover named packages, price/duration beside package names, illustrative-price
disclaimers, expected topics and obvious unsupported guarantees. Missing cases
and failed checks exit nonzero. These are conservative text heuristics, not semantic
accuracy or a guarantee of groundedness; review factual association, usefulness,
citations and tone manually. No live BC quality result is claimed by passing tests.

Official integration references:
[Developer guide](https://experienceleague.adobe.com/en/docs/brand-concierge/content/documentation/developer-customization-guide)
and [Knowledge Sources setup](https://experienceleague.adobe.com/en/docs/brand-concierge/content/documentation/overview#knowledge-sources).
No public programmatic send or hidden-context API was verified from those references.

On a Wanderly customer page, `window.dispatchEvent(new Event('wanderly:concierge-open'))` opens the same chat. This is a Wanderly event, not an Adobe API.

## Image note
The prototype uses remote travel imagery in `lib/data.ts`. Replace those URLs with approved/local assets before any external distribution.

## Step 2 — Journey instrumentation

Step 2 adds anonymous browser-session instrumentation and an internal journey inspector.

- A session ID is stored in `sessionStorage` (new browser tab/session = new anonymous session).
- The POC's journey events are stored locally in `localStorage`. Adobe's Web SDK and chat handle their own data separately.
- Route changes emit `PAGE_VIEW` plus semantic events such as `DESTINATION_VIEW`, `COMPARE_VIEW`, `TRAVEL_INFO_VIEW`, and `BOOKING_START`.
- Open `/agent` in a second tab to inspect the live session event timeline.
- Click **New session** in `/agent` to clear the current session and start a fresh test journey.

### Step 2 acceptance journey

1. Open `/agent` in one tab.
2. Open `/` in another tab.
3. Browse `Bali -> Maldives -> Compare -> Maldives`.
4. Confirm the inspector shows the route/page events and semantic journey signals.

AI `SILENT / WAIT / ASSIST` reasoning is deliberately deferred to Step 3.


## Step 2 complete - Journey Context Builder

The `/agent` inspector now shows both raw events and deterministic interpreted context: destination switching, comparison activity, pricing exploration, information seeking, booking progression, overall journey progression, and potential friction. This normalized context is the input contract for Step 3 AI decisioning.
