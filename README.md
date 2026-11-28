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
- `/agent` This tab's journey and client activation inspector
- `/agent/legacy` Legacy comparison and timeline inspector
- `/demo/live` Customer journey alongside the agent's visitor-safe explanation
- `/demo/compare` Three-lane presenter comparison

## Run locally
Requires Node 22.6+.

```bash
npm install
npm run dev
npm test
npm run typecheck
```

Open http://localhost:3000. Step 3 decisioning and the AI reasoner are documented in [STEP3.md](STEP3.md).

### AAA service boundary

The operator console and marketer authoring belong to the separate
[Adaptive Assistance Agent](https://github.com/BNanda99/adaptive-assistance-agent),
not this storefront. Wanderly has no operator proxy or operator credentials.
Its starter proxy retains `X-AAA-Trace-Id` for correlation, and `/agent` shows
only this tab's journey and reason-code-only client activation record. The
legacy AI comparison is at `/agent/legacy`.

The browser and Next starter proxy bundle `profile.json`. Updating a service
bundle alone does not update the storefront's profile or fallback templates;
profile changes require coordinated matching site and service deployment.
Do not reload during a submission or retry an uncertain submission.

### GitHub Pages build

Pages serves a static export, not a Next.js server. Query-driven destination,
package, information and booking selections are read in client components inside
Suspense boundaries so direct filtered links and Back navigation work without
server rendering. The Pages workflow uses Node 22 and enables
`WANDERLY_STATIC_EXPORT=true`; its Pages setup also supplies the deployment base
path and disables server image optimization.

To reproduce the export locally in PowerShell:

```powershell
$env:WANDERLY_STATIC_EXPORT = 'true'
npm run build
Remove-Item Env:WANDERLY_STATIC_EXPORT
```

The static export omits every `app/api` route handler (`.ts` files are excluded
from route discovery only when `WANDERLY_STATIC_EXPORT=true`), so the exported
`out` directory has no live `/api/assistance/reason` or `/api/aaa/*` endpoints.
Use rules-mode assistance on Pages; live server-side AI reasoning requires a
Next.js server deployment. A normal `npm run build` retains that server endpoint.

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

### Assistance privacy

The demo consent banner is used only when no host CMP adapter is present.
Sites with a CMP must install `window.aaaConsentAuthority` before AAA loads,
with `get()` returning `pending`, `granted` or `denied` and `subscribe(listener)`
returning an unsubscribe function. An invalid adapter fails closed. AAA does not
configure a host-owned Web SDK; its page-context transport therefore needs a
separate host integration. Manual chat follows Brand Concierge's own policy.

Journey events are minimized to approved catalog values and typed metadata.
They are kept per browser tab in `sessionStorage`, rather than in a shared
journey store. A tab's session expires after the configured inactivity period (30
minutes by default and at most 30 minutes): reads enforce
expiry, and a sweep deletes it each minute and whenever the tab becomes visible
again. Tabs purge their own journeys when they receive a decline. Older builds' shared
`localStorage` journey key is removed on load. Background tabs may have their
timers throttled or suspended, so deletion can be delayed until the tab next
runs. Closing a tab normally discards its `sessionStorage`, but browser session
restore, "duplicate tab", or opening a same-origin tab with an opener can copy it
(the new tab then continues as a separate copy), and physical deletion from disk
is not guaranteed.
Only catalog-derived page details are added to the AAA context. The separate
Concierge Service forwarding path remains unverified, and the demo BCOS
configuration may still read the Web SDK's standard URL including query data.

Each Web SDK event also reads the current canonical journey and attaches only
the profile's approved `contextMap` fields under
`_adaptiveAssistance.journeyContext`, including `pageRevision`. Stale or
over-budget journey context is omitted without blocking the event or manual chat.
This request-side delivery does not prove that the external Concierge Service
forwards those fields to BCOS or uses them in its answer.

### Site connections and guided authoring

The developer-owned [`sites/wanderly/profile.json`](sites/wanderly/profile.json)
declares the page taxonomy, signal mappings and other site connections. Its
configured mappings expose these generic behaviors to guided authoring:

| Visitor behavior | Canonical signal | Wanderly example |
| --- | --- | --- |
| View a page | `page.viewed` | Open a destination or package page |
| View an item | `entity.viewed` | View a destination or package |
| Compare items | `entity.compared` | Compare selected destinations |
| Seek information | `info.sought` | View practical or sample-price information |
| Select a preference | `facet.selected` | Select a trip priority |
| Progress through a transaction | `transaction.step` | Start or advance booking |

Developers wire sources once: the site's `track` adapter, configured
`data-aaa-*` attributes on click/change/submit, or mapped Adobe Client Data Layer
events. A mapping declares a capability; it does not prove that the site actually
emits the event. The collector validates the canonical signal and profile
taxonomy before recording it. Transaction completion or cancellation needs an
explicitly confirmed matching flow; leaving a page or idling is not confirmation.

Marketers work with guided Playbooks and Nudge Settings rather than editing
`signalMap`. A rule can be shared by multiple playbooks, so changing its
conditions affects all of them. The first matching rule wins; all specified
conditions must match. Playbook eligibility, approved evidence and consent,
transaction and form safeguards still apply.

An exported authoring draft is **not live**. A developer must review and deploy
the versioned profile to both the site and AAA service, with matching profile ID
and version. The site currently bundles the reviewed profile; saving or exporting
in the console does not replace it.

For the comparison page, the current pair's canonical IDs travel in the existing
starter request. The consent-gated page-context summary carries only that pair's
available demo-approved catalog trade-offs; it is omitted if either fact is
missing. These fictional facts are demo-approved, not brand or legal approved.
Real content review remains future work. One comparison can trigger the demo
moment without a practical-information lookup; transaction and exposure safeguards
remain in effect.

On Wanderly customer pages, the canonical Site Profile's `ASSIST` moment and
suppression policy can show an optional, non-modal nudge. **AAA never opens chat
until the visitor clicks Open chat, and never submits a question.** A separate
click on an SDK welcome question submits it. The nudge has a dismissal control,
keyboard support, a polite announcement and a "Why am I seeing this?" disclosure;
it never takes focus just by appearing. Dismissal is recorded by the canonical
policy. Existing conversations are never reset by AAA activation; consent
revocation's separate welcome reset is unchanged.

Before display, on click, and again after SDK readiness, activation rechecks the
canonical policy, session, profile version, page instance/revision, locale and
expiry. Navigation during generation drops the result with a reason code. Only
one generation request per session can be in flight.

The per-site Authoring nudge settings control the minimum interval, session cap,
inactivity expiry, dismissal suppression and chat-open suppression. Changes take
effect after activation; the site refreshes them after consent and before nudge
generation and activation, with a five-second cache. The server proxy pins the
reviewed profile and configured origin. If settings are unavailable or invalid,
the tab retains its last valid settings, or uses the existing defaults. Consent,
transaction and focused-form safeguards remain mandatory.

Set server-only `AAA_STARTER_SERVICE_URL` to the Python service's full
`POST /aaa/starters` URL when it is running. The site requests the opt-in
`/api/aaa/contextual-starters` proxy, which validates v1 or v2 contextual envelopes
and their frozen v1 result. If the contextual endpoint is unavailable or invalid, it
falls back to `/aaa/starters` and then eligible local templates. A validated
headline is used for the nudge, and returned starter text is shown unchanged.
An optional validated visitor brief is kept in memory, scoped to the current
session and profile, and added to journey XDM only while chat is open and it fits
the field and aggregate limits. This is request-side packaging, not proof that
Concierge receives or uses it. The spike flag and preset controls are deferred.
The proxy
uses the configured `AAA_STARTER_ORIGIN` (default `http://localhost:3000`), not a
caller-supplied tenant/origin. For the separate service's 15-second demo trial,
set `NEXT_PUBLIC_AAA_DEMO_SERVICE_TIMEOUT_MS=18000` before building/starting:
each upstream attempt waits at most 18 seconds; the browser allows time for
contextual and legacy attempts plus bounded trace retrieval. Values outside 1000–30000 milliseconds log a configuration
warning and retain the default. These asynchronous demo settings leave the page
and manual launcher responsive; they do not establish the 1.5-second production
latency requirement. Unconfigured,
unavailable or invalid service responses fall back to eligible, approved profile
templates, or abstain when no helpful primary template exists. Static Pages
deployments use the same local template/abstain fallback without a server endpoint.
No live BC tenant or manifest configuration is changed. Invalid profiles disable
AAA only; the site and manual chat launcher remain available. A failed Concierge
opening is surfaced without automatic replay, and the launcher permits a fresh
manual opening.

Timing defaults to the existing rules. Set `NEXT_PUBLIC_AAA_TIMING=agent` at build
time to ask the timing service at settled, paused, revisit and long-stay decision
points. Safeguards are checked before each request; failures stay silent and two
consecutive failures or an unavailable model switch the session to rules timing.
The timing proxy uses `AAA_STARTER_SERVICE_URL` and `AAA_STARTER_ORIGIN` and has
its own rate and concurrency limits. `AAA_TIMING_TIMEOUT_MS` controls its upstream
timeout (default 6000 ms). The timing response supplies no visitor-facing wording.

Destination, package-detail and destination-filtered information pages scope
questions to the current destination only. For example, Japan pages do not reuse
an earlier Bali/Maldives comparison or Bali FAQ. An open window updates its
browsing-based question on destination navigation without automatically sending
it; after assistance consent the manual launcher also supplies a current-destination suggestion.
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

AAA welcome examples come from a validated v1 `StarterResult`; manual welcome
examples still use catalog/template questions.
Destination browsing supplies relevant journey and approved FAQ examples;
package views use actual package names, and comparisons use the trusted shortlist.
There are zero to three pills in total, including the helpful primary; there is
no padding with default questions. Duplicate examples are removed.
Examples are recomputed on opening/reopening and destination navigation. Changes
to secondary examples also refresh an unsent welcome, but submitted conversations
are never rebootstrapped. Same-page clicks do not continually reset an open input;
their updated examples appear on reopening. Nothing is automatically submitted.
Catalog changes reach these examples when the site is rebuilt/deployed; this does
not automatically update Adobe's external knowledge.

Every manual launcher opening reads the current session again. Direct booking
links use their approved destination/package, and form edits record only canonical
destination/package selections for the current visit so reopening reflects the
visible plan, including a cleared package. A new booking URL visit discards the
previous visit's selection override. No departure dates, party details or free-form
input are added to these prompts. On unscoped pages, recent comparison activity
uses the current approved shortlist; an empty comparison does not resurrect old
destinations. Explicitly chosen priorities remain available even without browsing
history. A truly fresh session has no personalized choices to infer and therefore
shows general catalog examples. For a submitted Adobe conversation, the updated
question is shown in Wanderly's banner/copy control rather than resetting history.

AAA consumes the canonical suppression policy rather than the legacy rules/AI
comparison preview. Exposure is recorded exactly when a nudge is shown, not when
chat opens; failed generation does not consume exposure. Opening is asynchronous
and bounded: `ASSISTANCE_REQUESTED` becomes acknowledged `ASSISTANCE_OPENED`,
`ASSISTANCE_FAILED` or `ASSISTANCE_CANCELLED`. Only delivered assistance consumes
the delivery metrics; failures do not count as successful handling. SDK
initialization, message submission, response completion, feedback and visitor
acceptance are distinct. A response-completed event is not proof of correctness.
Closing or progression cancels a pending local request. The Volt Electronics
fixture still has no live Adobe concierge.

The `/agent` inspector's **AAA starter trace** shows bounded reason codes for
generation, tool calls, rejected alternatives, validator verdicts, fallbacks and
suppression when supplied by the service. It never includes raw page content,
tool inputs/outputs or generated questions. Traces are held in memory in this
tab and lost on a full reload. The proxy forwards `X-AAA-Trace-Id` and reads the
separately versioned `/aaa/traces/<id>` diagnostic events using the same trusted
origin; trace failures do not replace an otherwise valid starter result.
The older rules/AI comparison and per-signal timeline are at `/agent/legacy`;
they do not control AAA activation.

The `/demo/live` agent view displays visitor-scoped explanation data when
available; it is not a model transcript or evidence that Concierge used the
brief. `/demo/compare` compares Concierge alone, local approved templates, and
AAA on the same eligible journey. Its ambient block is a preview copied from
the tenant template, not proof of delivery. Both pages label the grounding
scoreboard as scripted, including a separate written-question gate replay; live
review and latency remain pending.
Contextual starter envelopes v2 and v3 are supported; v3 can label a helpful
question as written by the agent after service checks. The draft
`sites/wanderly/vocabulary.json` requires review before written starters are
enabled. Existing templates and commercial starters are unchanged.

The demo now has five scenarios: **Right moment** (Bali/Maldives comparison),
**Choose a package** (Island Rhythm/Bali Slow Living), **Practical travel
questions** (Japan entry guidance), **Right restraint** (no proactive chat during
booking progress), and **Respectful adaptation** (no repeat after dismissal with
the default nudge settings).
Comparison scenarios land on `/compare`; the others land on the relevant
customer page. Starting another
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
do not auto-submit. Typed AAA starter activation cannot use this hook even when the
flag is enabled. Use default suggestion mode for a supported interaction path.

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
- The POC's journey events are stored per tab in `sessionStorage`. Adobe's Web SDK and chat handle their own data separately.
- Route changes emit `PAGE_VIEW` plus semantic events such as `DESTINATION_VIEW`, `COMPARE_VIEW`, `TRAVEL_INFO_VIEW`, and `BOOKING_START`.
- Open `/agent/legacy` in the same tab to inspect the session event timeline.
- Click **New session** in `/agent` to clear the current session and start a fresh test journey.

### Step 2 acceptance journey

1. Open `/` and allow assistance.
2. Browse `Bali -> Maldives -> Compare -> Maldives` in the same tab.
3. Open `/agent` in that tab.
4. Confirm the inspector shows the route/page events and semantic journey signals.

AI `SILENT / WAIT / ASSIST` reasoning is deliberately deferred to Step 3.


## Step 2 complete - Journey Context Builder

The `/agent/legacy` inspector shows raw events and deterministic interpreted context: destination switching, comparison activity, pricing exploration, information seeking, booking progression, overall journey progression, and potential friction. This normalized context is the input contract for Step 3 AI decisioning.

## Scripted timing replay

Run `npm run evaluate:timing` for a single scripted replay of the 37 labelled journeys. It uses the actual journey runtime, rule matching, suppression and exposure budgets; the deterministic scripted judge is a pipeline fixture, not a model evaluation. The zero-based `stepInFrom` labels are approved. The report writes to stdout and reports latency as unavailable.

The replay approximates one decision point 3 seconds after each event, with events 4 seconds apart; it does not simulate long stays, visibility, chat, form focus or dismissals. It infers missing comparison selections from the last two distinct destinations, emits no signal for date searches, and reuses runtime page instances for the same URL. Package-only comparisons may therefore be blocked by eligibility or comparison selection. Rules and scripted timing are independent sessions with actual exposure cooldown; their end-of-journey agreement reflects the final decision point, not the reference's exposure-free baseline. Live evaluation is not implemented.

The report includes separate holdout metrics and a destination/package swap check. ASSIST journeys with invalid comparison selection at their labelled moment are listed as unreachable and excluded from assist and end-agreement denominators rather than counted as misses. The swap check compares decisions, safeguards and call counts, not fabricated model or latency results.
