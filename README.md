# Wanderly — Step 1 UI

A fictional premium travel marketplace for the Adaptive Assistance Agent POC.

## Included routes
- `/` Home
- `/destinations`
- `/destinations/bali`
- `/destinations/maldives`
- `/destinations/japan`
- `/destinations/switzerland`
- `/packages`
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

## Step 1 scope
Step 1 was UI only; instrumentation (Step 2) and assistance decisioning (Step 3) were added later.

## Brand Concierge

On Wanderly customer pages, a policy-approved `ASSIST` decision opens the Adobe Brand Concierge Web Client and submits a contextual first-person question built by `lib/concierge-message.ts` (for example, “I'm comparing Bali and Maldives. Can you help me decide which suits me better?”) without an invitation click. Only the intent, catalog destination/package names and an explicitly chosen priority are included; session IDs and raw events are not. Rules and AI-assisted proposals use the same policy gate: confidence, forward progress, dismissal/cooldown history, handled assistance types and session budget still apply. `SILENT`, `WAIT` and blocked proposals do not trigger chat. Automatic activation is recorded as `ASSISTANCE_TRIGGERED`, not visitor acceptance.

The SDK is loaded in advance, but the client is mounted on first opening. A greeting waits for SDK readiness; duplicate activations do not resend it, and an existing conversation is reopened without resetting its history or injecting another greeting. Closing the automatic popup counts as a visitor dismissal for subsequent policy decisions; closing before SDK readiness cancels the queued greeting. The local invitation/journey payload is not sent to Adobe. The Volt Electronics fixture has no live concierge configured.

Automatic submission uses the Adobe client's **undocumented** `data-initial-message` mount attribute and verifies the `query:submitted` callback. If this hook stops working, the popup shows an error instead of claiming submission succeeded. Adobe can still return a service error; triggering a query does not guarantee a successful answer.

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
