import type { JourneyState } from './contracts/types.ts';
import { DEMO_EXPOSURE_POLICY, type ActiveProfile } from './profile/loader.ts';
import type { NudgeSettings } from './nudge-settings.ts';

export type SuppressionReason =
  | 'consent.pending' | 'consent.denied' | 'profile.unavailable' | 'profile.policy_violation'
  | 'journey.unavailable' | 'journey.uncertain' | 'transaction.active' | 'transaction.uncertain'
  | 'chat.active' | 'form.focused' | 'exposure.dismissed' | 'exposure.limit' | 'exposure.cooldown';
export type SuppressionResult = { allowed: boolean; reasonCodes: SuppressionReason[] };
export type ExposureState = { count: number; lastShownAt?: number; dismissed: boolean };
export const emptyExposure = (): ExposureState => ({ count: 0, dismissed: false });

export function evaluateSuppression(input: {
  consent: 'pending' | 'denied' | 'granted';
  active?: ActiveProfile;
  journey?: JourneyState;
  exposure: ExposureState;
  chatActive: boolean;
  formFocused: boolean;
  now: number;
  settings?: NudgeSettings;
}): SuppressionResult {
  const { active, journey, exposure, now } = input;
  const reasons: SuppressionReason[] = [];
  if (input.consent !== 'granted') reasons.push(`consent.${input.consent}`);
  if (!active) reasons.push('profile.unavailable');
  else if (active.exposure.maxNudgesPerSession > DEMO_EXPOSURE_POLICY.maxNudgesPerSession
    || active.exposure.minNudgeIntervalMs < DEMO_EXPOSURE_POLICY.minNudgeIntervalMs
    || active.exposure.suppressAfterDismissal !== true) reasons.push('profile.policy_violation');
  if (!journey) reasons.push('journey.unavailable');
  else {
    if (journey.derived.inProgress.status === 'active') reasons.push('transaction.active');
    if (journey.derived.inProgress.status === 'uncertain') reasons.push('transaction.uncertain');
    if (journey.derived.hesitation.status === 'uncertain') reasons.push('journey.uncertain');
  }
  if (input.chatActive && (input.settings?.suppressWhileChatOpen ?? true)) reasons.push('chat.active');
  if (input.formFocused) reasons.push('form.focused');
  if (exposure.dismissed && (input.settings?.suppressAfterNotNow ?? true)) reasons.push('exposure.dismissed');
  if (!Number.isSafeInteger(exposure.count) || exposure.count < 0 || !Number.isFinite(now)
    || (exposure.count > 0 && exposure.lastShownAt === undefined)
    || (exposure.lastShownAt !== undefined && !Number.isFinite(exposure.lastShownAt))) reasons.push('journey.uncertain');
  if (active && exposure.count >= (input.settings?.maxNudgesPerSession ?? active.exposure.maxNudgesPerSession)) reasons.push('exposure.limit');
  if (exposure.lastShownAt !== undefined && now - exposure.lastShownAt < (input.settings?.minIntervalMs ?? active?.exposure.minNudgeIntervalMs ?? DEMO_EXPOSURE_POLICY.minNudgeIntervalMs)) reasons.push('exposure.cooldown');
  return { allowed: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
}

export function createSuppressionMachine(getInput: () => Parameters<typeof evaluateSuppression>[0], changed: (state: ExposureState) => void = () => {}) {
  return {
    evaluate: () => evaluateSuppression(getInput()),
    shown(): SuppressionResult {
      const input = getInput();
      const result = evaluateSuppression(input);
      if (result.allowed) changed({ ...input.exposure, count: input.exposure.count + 1, lastShownAt: input.now });
      return result;
    },
    dismiss() { changed({ ...getInput().exposure, dismissed: true }); },
  };
}
