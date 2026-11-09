# Step 3 - Adaptive Assistance Decisioning

This iteration adds an explainable baseline decision engine on top of the Step 2 Journey Context Builder.

## Current pipeline

Wanderly events -> Journey Context -> Rule Baseline Decision -> SILENT / WAIT / ASSIST

The rule baseline is an evaluation surface. It is intentionally separate from the
future execution policy, which will govern AI recommendations with confidence,
dismissal, budget, cooldown, and progression safeguards.

## Phase B — AI reasoner

The server-side `POST /api/assistance/reason` endpoint accepts only the canonical
`JourneyContext`. It selects a provider from environment configuration and
returns validated `AssistanceDecision` data plus safe provider metadata.

By default, or when live configuration is incomplete, the endpoint uses the
clearly labelled deterministic `MockLLMProvider`. A live provider can be configured with either of the following (see `.env.example`):

```text
WANDERLY_LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=approved-model
OPENAI_BASE_URL=https://api.openai.com/v1   # optional
```

```text
WANDERLY_LLM_PROVIDER=http
WANDERLY_LLM_ENDPOINT=https://approved-endpoint.example/reason
WANDERLY_LLM_API_KEY=...
WANDERLY_LLM_MODEL=approved-model
```

The API key and endpoint remain server-side. The browser receives only
`provider.name`, `provider.model`, `mode`, and the validated decision; provider
error details are logged server-side and never returned. Provider calls time out
after 15 seconds, request bodies are capped at 8 KB, and the endpoint is
rate-limited per client (30 requests/minute, in-memory per instance). The
system instruction includes the output schema, and decisions are rejected unless
`assistanceType` is `NONE` for SILENT/WAIT and specific for ASSIST. No final
execution policy is present yet.

## Phase C — Real-model journey evaluation

The reusable labelled dataset lives in `lib/labelled-journeys.ts` and contains
37 human-authored cases (the six `holdout-*` cases were added after rule tuning and are reported separately) across healthy progression, destination comparison,
package selection, information seeking, ambiguity, false-positive traps, and
disengagement. Labels are independent of both the rule baseline and model.

Run the offline/mock evaluation with:

```bash
npm run evaluate:assistance -- --runs=3
```

For an explicit live run, configure `.env.local` from `.env.example` and use:

```bash
npm run evaluate:assistance -- --live --runs=3
```

The harness reports accuracy, ASSIST precision/recall, ASSIST type accuracy, unnecessary interruption
and missed-assistance rates, WAIT/SILENT accuracy, confusion matrices,
disagreements, stability, and AI latency (average/P50/P95). Mock runs are labelled as a deterministic stand-in, not a real model. Results are written
to `evaluation/results/latest.json`; credentials are never stored. OpenAI token
usage is recorded when the provider returns it, otherwise it is `null`.

## Why deterministic first?

The hackathon hypothesis is that agentic reasoning can make better intervention decisions than simple proactive-chat rules. A deterministic baseline gives us something measurable to compare an LLM reasoner against instead of assuming the LLM is better.

## Decision policy

- Default to silence.
- Positive booking progression overrides earlier uncertainty and results in SILENT.
- Repeated travel-information seeking can result in ASSIST.
- Repeated destination switching plus comparison activity can result in ASSIST.
- Repeated pricing/package exploration waits for more evidence; pricing plus
  comparison activity can result in ASSIST.
- Early/ambiguous signals result in WAIT.

## Acceptance journeys

1. Maldives -> Resort/Package -> Booking => SILENT
2. Bali -> Maldives -> Bali -> Compare -> Maldives (continue switching once more if needed) => ASSIST
3. Japan -> Travel Info -> Japan -> Travel Info/FAQ => ASSIST
4. Maldives -> Package/Pricing -> another package/price => WAIT then ASSIST as evidence accumulates
5. Maldives -> Package -> Pricing -> Hotel -> Pricing -> Compare => ASSIST
6. Bali -> Maldives -> Compare -> Maldives -> Dates -> Booking => SILENT

Phase A now includes executable tests for all six journeys in
`lib/assistance-decision.test.ts`. The visible prototype instruments route
views, comparison actions, travel-information selection/FAQ actions, date
searches, package clicks (`PACKAGE_VIEW` + `PRICE_VIEW` per package), the
packages page (`PRICE_VIEW`), and booking. Opening `/booking` is not progression;
the first form interaction emits `BOOKING_START`, later ones `BOOKING_STEP`. A
`DATE_SEARCH` counts as forward progression. There is no hotel-selection or
booking-completion screen yet, so `HOTEL_VIEW` and `BOOKING_COMPLETE` remain
available for future UI work and are covered directly in tests.

## Known baseline limits

The rule baseline is tuned to the 31 original cases (100% there) and scores lower on the
six holdout cases (83.3%). The known miss is `holdout-compare-add-remove`: add/remove
actions all count as comparison activity, so backing out of a comparison can still ASSIST.
The mock provider is a deliberately weaker stand-in and is not a measure of a real model.

## Next Step 3 increment

Run a live evaluation (`--live`) to compare a real model with the baseline,
then build the deterministic execution policy (confidence threshold, cooldown,
dismissal, budget) and the customer-facing assistance UI that emits the
`ASSISTANCE_*` events.

## Phase D — Concierge activation plugin (POC)

A mocked brand concierge demonstrates the activation layer end to end:

```text
events -> JourneyContext -> proposal (rules or AI) -> policy gate -> balloon -> handoff -> mock concierge
```

- `lib/assistance-policy.ts` — deterministic gate: ASSIST only, confidence >= 0.8, no forward progress,
  no pending invitation, no repeat of a handled type, 2-minute cooldown after a dismissal, 2 invitations per session.
- `lib/concierge-handoff.ts` — the payload the plugin hands to the concierge (observed signals, entities, preferences).
- `lib/assistance-copy.ts` — observational balloon wording built from the entities.
- `lib/mock-concierge.ts` — scripted demo concierge driven only by the handoff and curated `lib/data.ts`.
- `lib/activation-proposal.ts` — optional AI proposal with silent fallback to the rules.
- `components/ConciergePlugin.tsx` / `MockConciergePanel.tsx` — balloon and panel, mounted in the root layout
  (hidden on `/agent` and `/booking`). An invitation is withdrawn if the journey stops warranting it.
- `/agent` shows the activation trace (decision -> policy -> invitation) and the handoff JSON, with a Rules / AI-assisted toggle.
- `lib/concierge-connector.ts` — the integration boundary. A brand implements `open(handoff)`; the plugin never depends on how the
  concierge renders. The handoff is versioned (`version: 1`); the bundled demo connector opens the mock panel.
- `/demo` — one-click scenario replay (right moment, right restraint, respectful adaptation) plus a reset button.
- `lib/brand-adapters.ts` — `BrandAdapter` contract mapping a brand's own events to the engine's signals, with an
  **electronics fixture** (`lib/brand-adapters.test.ts`) replayed through the same decision, policy and handoff code.
  This is a fixture, not a validated integration; intent names such as `DESTINATION_COMPARISON` are still travel-flavoured.

- `lib/assistance-outcomes.ts` — per-invitation outcome summary (accepted / dismissed / withdrawn / no response, chosen concierge priority,
  progression afterwards), shown in the inspector. Progression after an invitation is correlation, not proof of impact.
  The concierge priority is written back to the event stream as `ASSISTANCE_PREFERENCE`.
- Keyboard: Escape dismisses the balloon or closes the panel; the panel takes focus when it opens.

Not done yet: a live-model evaluation (needs `OPENAI_API_KEY` or an approved HTTP endpoint; the saved results are mock-only),
and server-side policy state (it is currently per-browser localStorage). `lib/concierge-flow.test.ts`): comparison shows the balloon; comparison followed by booking
stays silent; a dismissed invitation is not repeated. Quick replies are illustrative demo data, not live availability.
