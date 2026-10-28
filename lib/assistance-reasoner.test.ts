import assert from 'node:assert/strict';
import test from 'node:test';
import { reasonAboutAssistance } from './assistance-reasoner.ts';
import { validateJourneyContext } from './assistance-schema.ts';
import { MockLLMProvider, selectLLMProvider, type LLMProvider } from './llm-provider.ts';
import type { JourneyContext } from './journey-context.ts';

const context: JourneyContext = {
  destinationsViewed: ['Bali', 'Maldives'],
  packagesViewed: [],
  destinationSwitches: 1,
  packageSwitches: 0,
  destinationSwitching: 'MEDIUM',
  comparisonActivity: 'MEDIUM',
  pricingExploration: 'NONE',
  informationSeeking: 'NONE',
  bookingProgression: 'NONE',
  journeyProgression: 'NEUTRAL',
  potentialFriction: 'DESTINATION_SELECTION',
  recentJourney: ['DESTINATION_VIEW: Bali', 'COMPARE_VIEW'],
  semanticEventCount: 3,
};

test('mock provider returns a valid labelled AI decision', async () => {
  const result = await reasonAboutAssistance(context, { provider: new MockLLMProvider(), mode: 'mock' });
  assert.equal(result.mode, 'mock');
  assert.equal(result.provider.name, 'mock');
  assert.equal(validateJourneyContext(context).valid, true);
  assert.equal(result.decision.decision, 'WAIT');
});

test('invalid model response is rejected by the reasoner validator', async () => {
  const invalidProvider: LLMProvider = {
    name: 'test-invalid',
    model: 'invalid',
    generateStructured: async () => ({ decision: 'MAYBE' } as never),
  };
  await assert.rejects(reasonAboutAssistance(context, { provider: invalidProvider, mode: 'live' }), /validation/);
});

test('invalid JourneyContext is rejected before a provider is invoked', async () => {
  let invoked = false;
  const provider: LLMProvider = {
    name: 'test',
    model: 'test',
    generateStructured: async () => { invoked = true; throw new Error('must not invoke'); },
  };
  const invalid = { ...context, journeyProgression: 'UNKNOWN' };
  assert.equal(validateJourneyContext(invalid).valid, false);
  assert.equal(invoked, false);
  await assert.rejects(reasonAboutAssistance(invalid as JourneyContext, { provider, mode: 'live' }), /validation/);
});

test('missing live credentials selects the clearly labelled mock provider', () => {
  const selection = selectLLMProvider({ ...process.env, WANDERLY_LLM_PROVIDER: 'http' });
  assert.equal(selection.mode, 'mock');
  assert.equal(selection.provider.name, 'mock');
});

test('configured OpenAI credentials select the real provider without exposing credentials', () => {
  const selection = selectLLMProvider({
    ...process.env,
    WANDERLY_LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-secret',
    OPENAI_MODEL: 'gpt-test',
  });
  assert.equal(selection.mode, 'live');
  assert.equal(selection.provider.name, 'openai');
  assert.equal(selection.provider.model, 'gpt-test');
  assert.equal(JSON.stringify({ provider: { name: selection.provider.name, model: selection.provider.model } }).includes('test-secret'), false);
});
