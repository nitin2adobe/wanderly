const reasons: Record<string, string> = {
  'eligibility.matched': 'Fits this page and journey',
  'eligibility.page_type': 'Not used on this page',
  'eligibility.topic': "Needs a topic the visitor hasn't looked at",
  'eligibility.facet': "Needs a preference the visitor hasn't chosen",
  'eligibility.entity_type': 'Needs a different kind of item',
  'eligibility.not_in_moment_rule': 'Not part of this scenario',
  'eligibility.no_supported_template': 'No approved wording available here',
  'transaction.active': 'Visitor is booking — stay quiet',
  'transaction.uncertain': 'Visitor may be booking — stay quiet',
  'agent.validated': "Agent's choice passed checks",
  'agent.abstained': 'Agent decided not to help',
  'model.abstained': 'Agent decided not to help',
  'model.timeout': 'Model took too long',
  'model.disabled': 'Model switched off (templates only)',
  'provider.unavailable': 'Model service unavailable',
  'consent.pending': "Visitor hasn't agreed to assistance",
  'consent.denied': "Visitor hasn't agreed to assistance",
  'exposure.limit': 'Nudge limit reached',
  'exposure.cooldown': 'Too soon since the last nudge',
  'exposure.dismissed': 'Visitor said “Not now”',
  'chat.active': 'Chat is open',
  'form.focused': 'Visitor is typing in a form',
};

export function explainReason(code: string): string | undefined {
  if (code.startsWith('validation.')) return 'Model answer failed a check';
  if (code.startsWith('grounding.')) return 'Wording failed a grounding check';
  return reasons[code];
}

export const friendlyExplainId = (id: string) => id.replace(/[-_.]+/g, ' ').replace(/^./, c => c.toUpperCase());
export const provenanceLabel = (source: string) => source === 'generated'
  ? 'Chosen by the agent · passed checks' : source === 'approved' ? 'Approved example' : 'Source not recorded';

const rationaleLabels: Record<string, string> = {
  'signal.price_focus': 'because the visitor checked prices',
  'facet.explicit': 'because the visitor chose a preference',
  'signal.back_and_forth': 'because the visitor revisited options',
  'signal.info_seeking': 'because the visitor sought more information',
};

export function decisionDetails(explain: Record<string, unknown>) {
  const baseline = explain.baselinePlaybookId;
  const selection = explain.selection && typeof explain.selection === 'object' && !Array.isArray(explain.selection)
    ? explain.selection as Record<string, unknown> : {};
  const selected = selection.playbookId;
  const rationale = explain.rationale;
  const rulesChoice = typeof baseline === 'string' && baseline && typeof selected === 'string' && selected && baseline !== selected
    ? `Rules would have chosen: ${friendlyExplainId(baseline)}`
    : undefined;
  const reasons = Array.isArray(rationale)
    ? [...new Set(rationale.filter((code): code is string => typeof code === 'string').map(code => rationaleLabels[code]).filter((label): label is string => !!label))]
    : [];
  return { rulesChoice, reasons };
}
