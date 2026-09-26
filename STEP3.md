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
clearly labelled deterministic `MockLLMProvider`. A live provider can be
configured with:

```text
WANDERLY_LLM_PROVIDER=http
WANDERLY_LLM_ENDPOINT=https://approved-endpoint.example/reason
WANDERLY_LLM_API_KEY=...
WANDERLY_LLM_MODEL=approved-model
```

The API key and endpoint remain server-side. The browser receives only
`provider.name`, `provider.model`, `mode`, and the validated decision. No final
execution policy is present yet.

## Phase C — Real-model journey evaluation

The reusable labelled dataset lives in `lib/labelled-journeys.ts` and contains
31 human-authored cases across healthy progression, destination comparison,
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

The harness reports accuracy, ASSIST precision/recall, unnecessary interruption
and missed-assistance rates, WAIT/SILENT accuracy, confusion matrices,
disagreements, stability, and AI latency (average/P50/P95). Results are written
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
searches, and booking steps. There is no separate hotel-selection or booking
completion screen yet, so those event types remain available for future UI work
and are represented directly in the acceptance tests.

## Next Step 3 increment

Add an LLM reasoner behind the same structured DecisionResult contract and show baseline vs AI decisions side-by-side in /agent. The policy/guardrail layer remains deterministic.
