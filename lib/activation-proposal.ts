import { decideAssistance, type DecisionResult } from './assistance-decision.ts';
import { validateAssistanceDecision } from './assistance-schema.ts';
import type { JourneyContext } from './journey-context.ts';
import type { WanderlyEvent } from './events.ts';

export type ProposalSource = 'rules' | 'ai-mock' | 'ai-live' | 'rules-fallback';
export type Proposal = { decision: DecisionResult; source: ProposalSource };

type ReasonResponse = { mode?: 'mock' | 'live'; decision?: unknown };

export function recordedActivationProposal(events: WanderlyEvent[], context: JourneyContext, useAI: boolean): Proposal | undefined {
  const evaluation = events.filter(event => event.eventType === 'ASSISTANCE_EVALUATED').at(-1);
  const metadata = evaluation?.metadata;
  if (!metadata || metadata.contextKey !== JSON.stringify(context) || metadata.activationMode !== (useAI ? 'ai' : 'rules')) return;
  const source = metadata.source;
  if (source !== 'rules' && source !== 'rules-fallback' && source !== 'ai-live' && source !== 'ai-mock') return;
  const decision = validateAssistanceDecision(metadata.decision);
  if (decision.valid) return { decision: decision.value, source };
}

/**
 * Asks the server-side reasoner for a proposal and falls back to the deterministic
 * rules on any failure, so the visitor never sees a fabricated or unvalidated AI decision.
 */
export async function proposeAssistance(
  context: JourneyContext,
  useAI: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<Proposal> {
  if (!useAI) return { decision: decideAssistance(context), source: 'rules' };
  try {
    const response = await fetchImpl('/api/assistance/reason', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(context),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Reasoner returned HTTP ${response.status}.`);
    const body = (await response.json()) as ReasonResponse;
    const validated = validateAssistanceDecision(body.decision);
    if (!validated.valid) throw new Error('Reasoner returned an invalid decision.');
    return { decision: validated.value, source: body.mode === 'live' ? 'ai-live' : 'ai-mock' };
  } catch {
    return { decision: decideAssistance(context), source: 'rules-fallback' };
  }
}
