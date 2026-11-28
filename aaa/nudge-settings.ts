export type NudgeSettings = Readonly<{
  schemaVersion: '1.0';
  profileId: string;
  minIntervalMs: number;
  maxNudgesPerSession: number;
  inactivityTimeoutMs: number;
  suppressAfterNotNow: boolean;
  suppressWhileChatOpen: boolean;
}>;

export function defaultNudgeSettings(profileId: string): NudgeSettings {
  return {
    schemaVersion: '1.0', profileId, minIntervalMs: 600_000, maxNudgesPerSession: 2,
    inactivityTimeoutMs: 1_800_000, suppressAfterNotNow: true, suppressWhileChatOpen: true,
  };
}

export function validateNudgeSettings(value: unknown, profileId: string): NudgeSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const v = value as Record<string, unknown>;
  const integer = (n: unknown, min: number, max: number): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
  if (v.schemaVersion !== '1.0' || v.profileId !== profileId
    || !integer(v.minIntervalMs, 0, 86_400_000)
    || !integer(v.maxNudgesPerSession, 0, 100)
    || !integer(v.inactivityTimeoutMs, 60_000, 1_800_000)
    || typeof v.suppressAfterNotNow !== 'boolean'
    || typeof v.suppressWhileChatOpen !== 'boolean') return;
  return {
    schemaVersion: '1.0', profileId, minIntervalMs: v.minIntervalMs,
    maxNudgesPerSession: v.maxNudgesPerSession, inactivityTimeoutMs: v.inactivityTimeoutMs,
    suppressAfterNotNow: v.suppressAfterNotNow, suppressWhileChatOpen: v.suppressWhileChatOpen,
  };
}
