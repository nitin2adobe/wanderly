import reviewedProfile from '../sites/wanderly/profile.json' with { type: 'json' };
import { aaaAvailability, type AaaAvailability } from '../aaa/profile/gate.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY, type ProfileResult, type ProfileState } from '../aaa/profile/loader.ts';
import { getConsentAuthority, type ConsentAuthority } from './aaa-consent.ts';
import type { createJourneyStore } from './journey-store.ts';

export const AAA_UNAVAILABLE: AaaAvailability = Object.freeze({ enabled: false, reason: 'consent.pending' });

/**
 * Combines the consent authority with the Site Profile registry. AAA collects and uses journey
 * data only while consent is granted and a valid profile is active. Consent-only duties (purging
 * on decline, Web SDK consent) stay with the consent authority so the host and Brand Concierge
 * keep working when AAA is disabled.
 */
export function createAaaRuntime({ consent, profile, createCorrelationId }: {
  consent: () => ConsentAuthority;
  profile?: unknown;
  createCorrelationId?: () => string;
}) {
  const registry = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY, createCorrelationId });
  const listeners = new Set<() => void>();
  let cached: { consent: unknown; profile: ProfileState; value: AaaAvailability } | undefined;
  const get = (): AaaAvailability => {
    const state = consent().get();
    const profileState = registry.state();
    if (!cached || cached.consent !== state || cached.profile !== profileState) {
      cached = { consent: state, profile: profileState, value: aaaAvailability(state, profileState) };
    }
    return cached.value;
  };
  const changed = (operation: () => ProfileResult) => {
    try {
      return operation();
    } finally {
      listeners.forEach(listener => listener());
    }
  };
  if (profile !== undefined) registry.publish(profile);
  return {
    get,
    isEnabled: () => get().enabled,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const unsubscribe = consent().subscribe(() => listener());
      return () => { listeners.delete(listener); unsubscribe(); };
    },
    publish: (input: unknown) => changed(() => registry.publish(input)),
    rollback: () => changed(() => registry.rollback()),
    activate: (profileId: string, profileVersion: string) => changed(() => registry.activate(profileId, profileVersion)),
    versions: () => registry.versions(),
  };
}

export type AaaRuntime = ReturnType<typeof createAaaRuntime>;

type JourneyStore = ReturnType<typeof createJourneyStore>;

/**
 * Gates collection and use of a consent-gated journey store on AAA availability. Retention,
 * expiry sweeps and purges stay with the store's consent check, so data already held under
 * consent still expires on schedule while no valid profile is active.
 */
export function gateJourneyStore(store: JourneyStore, isEnabled: () => boolean): JourneyStore {
  return {
    ...store,
    getEvents: () => isEnabled() ? store.getEvents() : [],
    getSessionId: () => isEnabled() ? store.getSessionId() : '',
    currentJourney: () => isEnabled() ? store.currentJourney() : { sessionId: '', events: [] },
    track: (...args) => isEnabled() ? store.track(...args) : undefined,
  };
}

let runtime: AaaRuntime | undefined;
let serverRuntime: AaaRuntime | undefined;

/**
 * Browser runtime uses the versioned reference deployment profile, not a contract example.
 */
export function getAaaRuntime(): AaaRuntime {
  if (typeof window === 'undefined') return serverRuntime ??= createAaaRuntime({ consent: () => ({ kind: 'demo-banner', get: () => 'pending', subscribe: () => () => {} }) });
  runtime ??= createAaaRuntime({ consent: getConsentAuthority, profile: reviewedProfile });
  return runtime;
}

export const isAaaEnabled = () => typeof window !== 'undefined' && getAaaRuntime().isEnabled();
