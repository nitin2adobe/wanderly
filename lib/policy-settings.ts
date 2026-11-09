import { defaultPolicy, type PolicyOptions } from './assistance-policy.ts';

export const POLICY_SETTINGS_KEY = 'wanderly.policy.v1';
export const POLICY_SETTINGS_CHANGED = 'wanderly:policy-changed';

export const policyLimits = {
  minConfidence: { min: 0.5, max: 0.99 },
  cooldownSeconds: { min: 0, max: 600 },
  maxInvitationsPerSession: { min: 1, max: 5 },
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Accepts untrusted input and always returns in-range options, so stored values cannot disable the policy gate. */
export function sanitizePolicyOptions(raw: unknown): PolicyOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PolicyOptions, unknown>>;
  const { minConfidence: c, cooldownSeconds: s, maxInvitationsPerSession: m } = policyLimits;
  return {
    minConfidence: Math.round(clamp(r.minConfidence, c.min, c.max, defaultPolicy.minConfidence) * 100) / 100,
    cooldownMs: Math.round(clamp(typeof r.cooldownMs === 'number' ? r.cooldownMs / 1000 : undefined, s.min, s.max, defaultPolicy.cooldownMs / 1000)) * 1000,
    maxInvitationsPerSession: Math.round(clamp(r.maxInvitationsPerSession, m.min, m.max, defaultPolicy.maxInvitationsPerSession)),
  };
}

export function getPolicyOptions(): PolicyOptions {
  if (typeof window === 'undefined') return defaultPolicy;
  try {
    return sanitizePolicyOptions(JSON.parse(localStorage.getItem(POLICY_SETTINGS_KEY) ?? 'null'));
  } catch {
    return defaultPolicy;
  }
}

export function setPolicyOptions(options: PolicyOptions) {
  localStorage.setItem(POLICY_SETTINGS_KEY, JSON.stringify(sanitizePolicyOptions(options)));
  window.dispatchEvent(new Event(POLICY_SETTINGS_CHANGED));
}

export function resetPolicyOptions() {
  localStorage.removeItem(POLICY_SETTINGS_KEY);
  window.dispatchEvent(new Event(POLICY_SETTINGS_CHANGED));
}
