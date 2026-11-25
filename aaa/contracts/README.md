# AAA core contracts v1 (AAA-3)

Versioned JSON Schema (draft 2020-12) contracts for the Adaptive Assistance Agent. AAA is site-agnostic. Wanderly is one reference deployment, so these files contain no site or domain vocabulary. A test enforces this.

**Status: draft v1, not canonical or frozen.** The canonical schemas belong in the separate private Python AAA repository; Wanderly will consume a versioned copy. The files here are a proposed draft, not that canonical source or an established consumer copy. The private repository exists, but its addition to this Project was cancelled. Migration, the versioned Wanderly copy, and the consumer review gate below remain outstanding.

| Contract | Schema | Producer → consumer |
|---|---|---|
| CanonicalSignal | [v1/canonical-signal.schema.json](v1/canonical-signal.schema.json) | collector (E2) → journey model |
| JourneyState | [v1/journey-state.schema.json](v1/journey-state.schema.json) | journey model (E2) → moment detector (E4), starter request |
| SiteProfile | [v1/site-profile.schema.json](v1/site-profile.schema.json) | implementer (E3) → all core modules |
| StarterRequest | [v1/starter-request.schema.json](v1/starter-request.schema.json) | client → `POST /aaa/starters` (E5) |
| StarterResult | [v1/starter-result.schema.json](v1/starter-result.schema.json) | `/aaa/starters` (E5) → nudge/BC adapter (E6, E7) |

Shared definitions are in [v1/common.schema.json](v1/common.schema.json). `types.ts` mirrors the schemas in TypeScript. `validate.ts` is a dependency-free validator for the schema subset used here, and it returns `{ path, message }` diagnostics. It throws on any unsupported keyword, so it never under-validates silently. The schemas also compile under Ajv 2020 strict mode.

## Conventions

- **schemaVersion** is required on every contract and is `1.0.0` in v1. Additive, backward-compatible changes bump the minor version. Breaking changes create `v2/` with new `$id`s (`urn:aaa:contracts:v<N>:<name>`).
- **profileVersion** is an immutable semver of a reviewed Site Profile. Any change is a new version.
- **provenance**: `explicit` means directly observed from a visitor action or host-declared data. `inferred` means derived by AAA or an adapter. Signals and facet values carry it, and derived states are always `inferred`.
- **locale** is a BCP 47 tag on signals, journey state and results. Profiles declare `locales.default` and `locales.supported`.
- **pageInstanceId + pageRevision** identify the page a signal, snapshot or result belongs to. `pageRevision` increments on meaningful in-page changes and is used for staleness checks. Only event-like or page-bound objects carry these fields. A SiteProfile does not.
- **Raw versus derived**: CanonicalSignal holds only the six raw kinds. `hesitation` and `inProgress` exist only in `JourneyState.derived`, as tri-state (`active` / `inactive` / `uncertain`) values with their basis signals.
- **No free text or PII**: IDs follow `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Facet values are profile-declared IDs. Unknown properties are rejected. Only starter text and profile labels are text, and they must be rendered as text, never as HTML.
- **No tenant identity or URLs from clients**: StarterRequest has no tenant field. Tenant identity comes from the server-issued token. Profiles and requests have no URL fields.
- **No fixed thresholds**: hesitation parameters and the `inProgress` idle timeout are required profile values with no defaults.

## Semantics that JSON Schema cannot express (consumer checks)

- Every `pageType`, `entityType`, `facetId`, `topicId`, `playbookId` and `evidenceId` must exist in the referenced Site Profile version.
- In a StarterRequest, the journey's `sessionId`, `profileVersion`, `locale` and `page` must be echoed in the StarterResult. The client drops results that no longer match.
- `seq` and `pageRevision` are monotonic per session and per page instance.
- `locale` must be in the profile's `locales.supported`.

## Decisions

**User-approved (AAA-3):** D4 signal set. The six raw kinds of PRD §3 form a closed v1 enum, and a new kind requires a schema version bump. The two derived states follow PRD §3.

**Approved (D10):** a versioned JSON Site Profile validated by JSON Schema. Its canonical schemas belong in the private AAA repository, with a versioned copy consumed by Wanderly.

The following encode PRD v2 recommendations that are **not user-approved**. Changing them later only needs a minor or major bump.

- **D6 (starter caps):** StarterResult allows at most 3 starters, with at most one primary and at most one commercial starter.
- **D16 (suppression):** not encoded. The contract only carries the tri-state `inProgress` and profile-supplied timeouts.
- **Other choices made here:** `transaction.step` uses `phase` values `start`, `step` and `complete`. A commercial playbook must list `offerIds`. A fallback result must contain template starters and a reason code. An abstain result must contain no starters or offers and must have a reason code.

## Review gate (AAA-3 acceptance)

The owners of these workstreams have **not yet reviewed** the contracts. Their review of the canonical contracts is required before freezing:

- **E2 (signal capture):** the CanonicalSignal kind payloads, `source`, and whether JourneyState should embed raw signals or keep a bounded summary.
- **E5 (starter service):** the StarterRequest payload size, given that it embeds the journey; the StarterResult outcome rules and reason codes.
- **E6 (BC context):** the `contextMap` path allowlist and the `bcBinding` fields. These depend on the AAA-1 and AAA-2 findings.
- **E7 (UX and localization):** starter roles, plain-text limits, and locale fallback.
- **E3 and E4 (indirect consumers):** the `momentRules` shape is provisional.

## Run the checks

```sh
node --experimental-strip-types --test aaa/contracts/*.test.ts
```

The fixtures in `examples/` (travel and retail) are illustrative. They are not the AAA-14 or AAA-15 profiles.
