import { explainReason } from './aaa-explain-labels.ts';
import type { DecisionPointKind } from './aaa-decision-points.ts';

export function timingPointLabel(kind: DecisionPointKind): string {
  return {
    page_settled: 'page settled', activity_paused: 'activity paused',
    long_stay: 'long stay', revisit: 'came back',
  }[kind];
}

export function timingReasonLabels(codes: readonly string[], names: readonly string[]): string[] {
  const pair = names.length >= 2 ? `${names[0]} and ${names[1]}` : 'choices';
  const labels: Record<string, string> = {
    'signal.back_and_forth': `switching between ${pair}`,
    'signal.revisit': names[0] ? `came back to ${names[0]}` : 'came back to a choice',
    'signal.compared': `comparing ${pair}`,
    'signal.long_stay': 'a long stay on this page',
    'signal.price_focus': 'checking prices',
    'signal.info_seeking': 'looking for practical information',
    'signal.preference_set': 'chose a preference',
    'progress.single_focus': 'focused on one choice',
    'engagement.new_visit': 'early in the visit',
    'engagement.low': 'only just arrived on this page',
  };
  return codes.map(code => labels[code]).filter((label): label is string => !!label);
}

export function timingOutcomeLabel(source: string, outcome: string, codes: readonly string[]): string {
  if (source === 'safeguard') {
    if (outcome === 'blocked' && codes.length === 1 && codes[0] === 'moment.not_assist') {
      return "No help offered on this page (the agent wasn't asked)";
    }
    const reason = codes.includes('transaction.active') ? 'booking in progress'
      : codes.includes('transaction.uncertain') ? 'booking may be in progress'
      : codes.map(explainReason).find(Boolean)?.toLowerCase() ?? 'help is not eligible here';
    return `Safeguard: ${reason} (the agent wasn’t asked)`;
  }
  if (source === 'rules.fallback') return 'Timing by rules (agent unavailable)';
  if (source === 'agent.failed') return 'Stayed silent: no usable answer from the agent';
  if (outcome === 'pending') return 'Deciding…';
  return outcome === 'assist' ? 'Stepped in' : 'Stayed silent';
}
