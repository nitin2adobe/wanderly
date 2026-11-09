import type { DecisionResult } from './assistance-decision.ts';
import type { ProposalSource } from './activation-proposal.ts';

export type ComparisonRow = {
  /** Identifies the journey context this row was computed for. */
  key: string;
  rules: DecisionResult;
  ai: DecisionResult;
  source: ProposalSource;
  latencyMs: number;
};

export type Agreement = 'AGREE' | 'DISAGREE' | 'UNAVAILABLE';

/** Rules and AI agree only when both the decision and the assistance type match. */
export function agreementFor(row: Pick<ComparisonRow, 'rules' | 'ai' | 'source'>): Agreement {
  if (row.source === 'rules-fallback') return 'UNAVAILABLE';
  return row.rules.decision === row.ai.decision && row.rules.assistanceType === row.ai.assistanceType ? 'AGREE' : 'DISAGREE';
}

export type AgreementSummary = { total: number; agreed: number; disagreed: number; unavailable: number };

/** Fallbacks are counted separately so an AI outage never looks like agreement. */
export function summariseAgreement(rows: Array<Pick<ComparisonRow, 'rules' | 'ai' | 'source'>>): AgreementSummary {
  const summary: AgreementSummary = { total: rows.length, agreed: 0, disagreed: 0, unavailable: 0 };
  for (const row of rows) {
    const a = agreementFor(row);
    if (a === 'AGREE') summary.agreed++;
    else if (a === 'DISAGREE') summary.disagreed++;
    else summary.unavailable++;
  }
  return summary;
}
