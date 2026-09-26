import type { AssistanceDecisionSchema } from './assistance-schema.ts';
import type { JourneyContext } from './journey-context.ts';

export type LLMRequest = {
  systemInstruction: string;
  context: JourneyContext;
};

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LLMProvider<T = AssistanceDecisionSchema> = {
  readonly name: string;
  readonly model: string;
  readonly lastUsage?: TokenUsage;
  generateStructured(request: LLMRequest): Promise<T>;
};

export type ProviderSelection = {
  provider: LLMProvider;
  mode: 'mock' | 'live';
};

const systemInstruction = `You decide whether proactive assistance would genuinely help an anonymous visitor during their current Wanderly session.
Return only a JSON object matching the requested AssistanceDecision schema.
Default to SILENT or WAIT when evidence is weak. Progression beats activity. Comparison alone does not justify intervention.
Do not infer demographics, sensitive attributes, or facts absent from JourneyContext.
The reason must be concise and explain observable evidence, never hidden chain-of-thought.`;

function mockDecision(context: JourneyContext): AssistanceDecisionSchema {
  if (context.journeyProgression === 'POSITIVE' || context.bookingProgression !== 'NONE') {
    return {
      decision: 'SILENT', confidence: 0.94, assistanceType: 'NONE',
      headline: 'Let the journey continue',
      reason: 'The visitor is progressing toward booking, so interruption is unlikely to help.',
      evidence: ['Positive journey progression is present.'],
    };
  }
  if (context.potentialFriction === 'TRAVEL_INFORMATION' && context.informationSeeking === 'HIGH') {
    return {
      decision: 'ASSIST', confidence: 0.88, assistanceType: 'TRAVEL_INFORMATION',
      headline: 'Offer travel-information help',
      reason: 'Repeated information seeking suggests an unresolved question where contextual help may be valuable.',
      evidence: ['Information-seeking activity is high.', 'No positive booking progression is present.'],
    };
  }
  if (context.potentialFriction === 'DESTINATION_SELECTION' && context.destinationSwitches >= 3 && context.comparisonActivity !== 'NONE') {
    return {
      decision: 'ASSIST', confidence: 0.86, assistanceType: 'DESTINATION_COMPARISON',
      headline: 'Offer destination comparison',
      reason: 'Repeated switching and comparison suggest the destination choice remains unresolved.',
      evidence: [`${context.destinationSwitches} destination switches are present.`, 'Comparison activity is present.'],
    };
  }
  if (context.potentialFriction === 'PACKAGE_SELECTION' && context.pricingExploration === 'HIGH' && context.comparisonActivity !== 'NONE') {
    return {
      decision: 'ASSIST', confidence: 0.82, assistanceType: 'PACKAGE_SELECTION',
      headline: 'Offer package-selection help',
      reason: 'Repeated pricing exploration plus comparison suggests uncertainty about package selection.',
      evidence: ['Pricing exploration is high.', 'Comparison activity is present without booking progression.'],
    };
  }
  if (context.potentialFriction !== 'NONE' || context.comparisonActivity !== 'NONE') {
    return {
      decision: 'WAIT', confidence: 0.7, assistanceType: 'NONE',
      headline: 'Gather more evidence',
      reason: 'There are early signals, but the current context does not establish enough unresolved need to interrupt.',
      evidence: ['Assistance signals are present but not yet strong.'],
    };
  }
  return {
    decision: 'SILENT', confidence: 0.86, assistanceType: 'NONE',
    headline: 'No assistance needed',
    reason: 'The current context does not show meaningful unresolved friction.',
    evidence: ['No strong assistance signal is present.'],
  };
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'wanderly-mock-v1';

  async generateStructured(request: LLMRequest): Promise<AssistanceDecisionSchema> {
    return mockDecision(request.context);
  }
}

class HttpLLMProvider implements LLMProvider {
  readonly name = 'http';
  readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    model: string,
    endpoint: string,
    apiKey: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.model = model;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async generateStructured(request: LLMRequest): Promise<AssistanceDecisionSchema> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        instruction: request.systemInstruction,
        context: request.context,
        responseFormat: 'json',
      }),
    });
    if (!response.ok) throw new Error(`LLM provider returned HTTP ${response.status}.`);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') throw new Error('LLM provider returned a non-object response.');
    const wrapped = (body as { decision?: unknown }).decision;
    const candidate = wrapped && typeof wrapped === 'object' ? wrapped : body;
    if (!candidate || typeof candidate !== 'object') throw new Error('LLM provider response did not contain a decision object.');
    return candidate as AssistanceDecisionSchema;
  }
}

class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  lastUsage?: TokenUsage;

  constructor(model: string, apiKey: string, baseUrl = 'https://api.openai.com/v1', fetchImpl: typeof fetch = fetch) {
    this.model = model;
    this.apiKey = apiKey;
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    this.fetchImpl = fetchImpl;
  }

  async generateStructured(request: LLMRequest): Promise<AssistanceDecisionSchema> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: JSON.stringify(request.context) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI provider returned HTTP ${response.status}.`);
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    this.lastUsage = body.usage && {
      promptTokens: body.usage.prompt_tokens,
      completionTokens: body.usage.completion_tokens,
      totalTokens: body.usage.total_tokens,
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI provider returned no message content.');
    let parsed: unknown;
    try { parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, '').trim()); }
    catch { throw new Error('OpenAI provider returned invalid JSON content.'); }
    return parsed as AssistanceDecisionSchema;
  }
}

export function selectLLMProvider(env: NodeJS.ProcessEnv = process.env): ProviderSelection {
  const configured = env.WANDERLY_LLM_PROVIDER?.toLowerCase();
  if (configured === 'openai' && env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    return {
      provider: new OpenAIProvider(env.OPENAI_MODEL, env.OPENAI_API_KEY, env.OPENAI_BASE_URL),
      mode: 'live',
    };
  }
  const endpoint = env.WANDERLY_LLM_ENDPOINT;
  const apiKey = env.WANDERLY_LLM_API_KEY;
  const model = env.WANDERLY_LLM_MODEL;
  if (configured === 'http' && endpoint && apiKey && model) {
    return { provider: new HttpLLMProvider(model, endpoint, apiKey), mode: 'live' };
  }
  return { provider: new MockLLMProvider(), mode: 'mock' };
}

export { systemInstruction };
