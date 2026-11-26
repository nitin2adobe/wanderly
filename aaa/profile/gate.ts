import type { ActiveProfile, ProfileDiagnostic, ProfileState } from './loader.ts';

export type ConsentDecision = 'pending' | 'granted' | 'denied';

export type AaaAvailability =
  | Readonly<{ enabled: true; active: ActiveProfile }>
  | Readonly<{ enabled: false; reason: 'consent.pending' | 'consent.denied' }>
  | Readonly<{ enabled: false; reason: 'profile.unavailable'; diagnostic?: ProfileDiagnostic }>;

/**
 * AAA runs only with granted consent and an active, valid profile. Consent is checked first, so
 * profile diagnostics are not exposed before consent. Any unknown consent value fails closed.
 */
export function aaaAvailability(consent: unknown, profile: ProfileState): AaaAvailability {
  if (consent === 'denied') return Object.freeze({ enabled: false, reason: 'consent.denied' });
  if (consent !== 'granted') return Object.freeze({ enabled: false, reason: 'consent.pending' });
  if (!profile.enabled) return Object.freeze({ enabled: false, reason: 'profile.unavailable', ...(profile.diagnostic ? { diagnostic: profile.diagnostic } : {}) });
  return Object.freeze({ enabled: true, active: profile.active });
}
