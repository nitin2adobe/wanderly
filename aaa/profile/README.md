# AAA Site Profile loader (AAA-12)

Site-agnostic loader for Site Profiles validated against the vendored, frozen v1 contracts in [`../contracts/v1/`](../contracts/v1/).

`createProfileRegistry({ policy })` returns a registry. AAA is disabled until a profile is successfully published.

- `publish(profile)` accepts JSON text or a parsed value and runs these checks in order:
  1. Validates against `site-profile.schema.json`.
  2. Checks that declared IDs are unique and that internal references resolve (locales, page types, funnel stages, rule playbooks, evidence, eligibility, success-event page types).
  3. Applies the deployment exposure policy.
  4. Stores the profile as an immutable, deep-frozen version keyed by `profileId` and `profileVersion`.

  If every check passes, the version is activated. Republishing identical content is idempotent. Different content under an existing version is a `profile.version_conflict`. **Any failed publish disables AAA**; the loader never clamps or repairs a profile.
- `rollback()` restores the previous good version. After a failed publish, that is the last active version; otherwise it is the version active before the current one. If none exists, it reports `profile.rollback_unavailable` and leaves the state unchanged.
- `activate(profileId, profileVersion)` re-activates any published version.
- `state()` returns either `{ enabled: true, active: { profile, exposure } }` or `{ enabled: false, diagnostic? }`.

`aaaAvailability(consent, profileState)` in [`gate.ts`](gate.ts) combines this state with the AAA-5 consent decision. AAA is available only when consent is `granted` and a valid profile is active. Pending, denied or unknown consent fails closed before any profile diagnostic is exposed.

**Wanderly integration (local demo, provisional):** [`lib/aaa-runtime.ts`](../../lib/aaa-runtime.ts) creates one browser registry with `DEMO_EXPOSURE_POLICY` and combines it with the AAA-5 consent authority. It is tested in `lib/aaa-runtime.test.ts`.

These are gated on `aaaAvailability(...).enabled`, so they are off unless consent is granted and a valid profile is active:
- journey collection and reads, through `gateJourneyStore`;
- the journey tracker;
- invitations, and re-scheduling them when consent or the profile changes;
- automatic Brand Concierge opens;
- journey suggestions in manual chat;
- ambient page context;
- the inspector's AI reasoner call.

These stay with consent alone:
- Web SDK consent;
- the purge when consent is declined;
- retention and expiry sweeps of data already held under consent.

Losing the profile therefore stops new collection and host-side journey reads, but does not purge that data; it still expires on schedule. Manual chat remains available without AAA.

On loss of consent or profile availability, Wanderly hides its own suggestion, cancels pending automatic openings, and re-bootstraps a personalized Brand Concierge welcome with the generic catalog defaults using `resetWelcome`, whether chat is open or closed and even after a message was sent. The observed global API (`bootstrap`, `clearHistory`, `registerFormProvider`) has no welcome-only reset. The user approved losing the visible transcript on revocation so personalized welcome questions can be removed; manual chat remains available. This does not call `clearHistory` or claim deletion of a server-side conversation.

Browser verification against the real SDK covered submitted conversations with chat both open and closed: declining removed the personalized questions and prior transcript from the SDK mount, restored generic defaults, and did not open a closed chat. With consent still denied, a newly typed message appeared and received an SDK reply. The tenant returned its existing generic inability-to-process fallback both before and after withdrawal; this confirms manual sending, not successful travel answers.

This clears the local UI only: context already sent to Adobe or a model provider is not recalled.

Until a reviewed Wanderly profile exists (AAA-14), the demo publishes the illustrative contract fixture `aaa/contracts/examples/travel.ts`, which is not a reviewed profile. The app does not yet expose a way to publish another version or roll back at runtime.

The loader's exposure policy validates the profile independently of the per-site Authoring nudge settings used by the current activation runtime.

**Diagnostics** follow the v1 convention. Each one contains:
- a stable code;
- a generated correlation ID (1–128 characters, limited to letters, digits, dot, underscore, colon and hyphen);
- the contract name, schema ID and schema version;
- optionally, one allow-listed field name (a top-level profile property or an exposure field).

Diagnostics omit profile identifiers as well as schema messages, instance values and host paths. A misconfigured correlation ID generator throws; a failed publish still disables AAA.

**Exposure policy (D16, demo, user confirmed):** `DEMO_EXPOSURE_POLICY` allows at most 2 nudges per session, at least 600000 ms apart, and none after dismissal. It is separate from the generic schema.
- Profiles may be stricter.
- A weaker `maxNudgesPerSession` or `minNudgeIntervalMs` is rejected as `profile.policy_violation`.
- Omitted fields keep the policy values in `active.exposure`.
- Dismissal suppression cannot be configured by a profile.
- A registry snapshots its deployment policy at creation. Its limits must be non-negative safe integers.
- Activated per-site Authoring settings independently set the runtime limits and dismissal/chat suppression; when unavailable, the runtime uses its last valid settings or the existing defaults.

Not implemented here:
- transaction confirmation for `inProgress`;
- signal-mapping conflict detection (E2);
- context packaging (E6);
- offer approval;
- tenant/token matching;
- persistence of the registry across processes;
- a review/approval workflow.

The registry trusts that callers publish only reviewed versions.
