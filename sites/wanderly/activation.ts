import { getAaaRuntime } from '../../lib/aaa-runtime.ts';
import { getSessionId } from '../../lib/tracking';
import type { ActivationProvider } from '../../lib/aaa-activation.ts';
import {
  getCanonicalJourney, getCurrentMoment, evaluateCurrentSuppression, recordNudgeShown, recordNudgeDismissed, getComparisonSelection, refreshNudgeSettings,
} from './aaa.ts';

/** Wanderly wiring only; activation itself never derives signals or duplicates suppression policy. */
export const wanderlyActivation: ActivationProvider = {
  refresh: refreshNudgeSettings,
  read(currentNudge, visitorActivation = false) {
    const availability = getAaaRuntime().get();
    if (!availability.enabled || !getSessionId()) return;
    const journey = getCanonicalJourney();
    const moment = getCurrentMoment();
    if (!journey || !moment) return;
    const conciergeFocused = typeof document !== 'undefined'
      && !!document.querySelector('.brandConciergeWindow')?.contains(document.activeElement);
    const suppression = evaluateCurrentSuppression({
      currentNudge,
      // This flag is passed only after the visitor has explicitly requested this opening.
      ...(visitorActivation ? { chatActive: false, ...(conciergeFocused ? { formFocused: false } : {}) } : {}),
    });
    const selection = journey.page.pageType === 'comparison' ? getComparisonSelection() : undefined;
    const validSelection = journey.page.pageType !== 'comparison' || selection?.length === 2;
    return {
      journey, profile: availability.active.profile, momentRuleId: moment.id,
      allowed: suppression.allowed && moment.decision === 'ASSIST' && validSelection,
      reasonCodes: moment.decision !== 'ASSIST' ? ['moment.not_assist']
        : !validSelection ? ['comparison.invalid_selection']
        : suppression.reasonCodes,
    };
  },
  recordShown: recordNudgeShown,
  recordDismissed: recordNudgeDismissed,
};
