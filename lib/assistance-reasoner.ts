import { validateAssistanceDecision, validateJourneyContext, type AssistanceDecisionSchema } from './assistance-schema.ts';
import type { JourneyContext } from './journey-context.ts';
import { selectLLMProvider, systemInstruction, type ProviderSelection, type TokenUsage } from './llm-provider.ts';

export type AIReasonerResult = {
  provider: { name: string; model: string };
  mode: ProviderSelection['mode'];
  decision: AssistanceDecisionSchema;
  usage?: TokenUsage;
};

export async function reasonAboutAssistance(
  context: JourneyContext,
  selection: ProviderSelection = selectLLMProvider(),
): Promise<AIReasonerResult> {
  const contextValidation = validateJourneyContext(context);
  if (!contextValidation.valid) throw new Error(`JourneyContext validation failed: ${contextValidation.errors.join(' ')}`);
  const raw = await selection.provider.generateStructured({ systemInstruction, context });
  const validated = validateAssistanceDecision(raw);
  if (!validated.valid) throw new Error(`LLM response failed AssistanceDecision validation: ${validated.errors.join(' ')}`);
  return {
    mode: selection.mode,
    provider: { name: selection.provider.name, model: selection.provider.model },
    decision: validated.value,
    usage: selection.provider.lastUsage,
  };
}
