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
This environment could not install npm dependencies, so install them on your development machine:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Step 1 scope
This version intentionally contains no journey instrumentation, agent decisioning, or chat. Those are Steps 2–6 of the POC.

## Image note
The prototype uses remote travel imagery in `lib/data.ts`. Replace those URLs with approved/local assets before any external distribution.

## Step 2 — Journey instrumentation

Step 2 adds anonymous browser-session instrumentation and an internal journey inspector.

- A session ID is stored in `sessionStorage` (new browser tab/session = new anonymous session).
- Events are stored locally in `localStorage` for the POC; no personal data is collected.
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
