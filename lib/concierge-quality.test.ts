import assert from 'node:assert/strict';
import test from 'node:test';
import { conciergeKnowledge, conciergeKnowledgeCsv } from './concierge-knowledge.ts';
import { checkConciergeAnswer, conciergeAnswerCases } from './concierge-evaluation.ts';
import { createConciergeEventRouter, createConciergeObserver } from './concierge-observer.ts';
import { conciergeMetrics, summariseOutcomes } from './assistance-outcomes.ts';
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { getPackage, packages } from './data.ts';
import { deriveMemory } from './assistance-memory.ts';

test('knowledge is versioned from catalog content and exports all packages with quote-safe public URLs', () => {
  const data = conciergeKnowledge();
  assert.equal(data.packages.length, packages.length);
  for (const pack of data.packages) assert.equal(pack.illustrativePricePerPerson, getPackage(pack.id)?.priceValue);
  assert.match(data.priceBasis, /two adults sharing/);
  assert.equal(data.version, conciergeKnowledge().version);
  const csv = conciergeKnowledgeCsv('https://travel.example/demo');
  assert.match(csv, /https:\/\/travel.example\/demo\/concierge-knowledge/);
  assert.match(csv, /packages\/bali-slow-living/);
  assert.throws(() => conciergeKnowledgeCsv('http://travel.example'), /HTTPS/);
  assert.throws(() => conciergeKnowledgeCsv('https://user:password@travel.example'), /credentials/);
});

test('answer checks accept grounded example facts but flag wrong prices, missing disclaimers and guarantees', () => {
  const scenario = conciergeAnswerCases[0];
  const response = 'Island Rhythm: 7 nights, Balanced pace, illustrative $2,190 per person, two adults sharing. Bali Slow Living: 9 nights, Relaxed pace, sample $2,490 per person, two adults sharing. International flights are excluded.';
  assert.equal(checkConciergeAnswer(scenario, response).checksPassed, true);
  assert.equal(checkConciergeAnswer(scenario, response.replace('$2,490', '$999')).checksPassed, false);
  assert.equal(checkConciergeAnswer(scenario, response.replace('$2,190', '$TEMP').replace('$2,490', '$2,190').replace('$TEMP', '$2,490')).checksPassed, false);
  assert.equal(checkConciergeAnswer(scenario, response.replace(/illustrative|sample/g, '')).checksPassed, false);
  assert.equal(checkConciergeAnswer(scenario, response + ' Availability is guaranteed.').checksPassed, false);
  assert.equal(checkConciergeAnswer(scenario, response).manualReviewRequired, true);
});

test('SDK observation deduplicates responses by interaction and records no query, response or feedback-note text', () => {
  const events: WanderlyEvent[] = [];
  let time = 0;
  const record = (eventType: WanderlyEventType, metadata: Record<string, unknown>) => {
    events.push({ id: String(events.length), sessionId: 's', eventType, timestamp: new Date(time).toISOString(), page: '/', metadata });
  };
  const observer = createConciergeObserver({ activationId: 'a1', assistanceType: 'PACKAGE_SELECTION', question: 'Approved question', record, now: () => time });
  observer({ eventType: 'query:submitted', data: { query: 'private visitor text' } });
  const data = { conversationId: 'c1', interactionId: 'i1' };
  observer({ eventType: 'response:started', data });
  time = 75;
  observer({ eventType: 'response:completed', data });
  observer({ eventType: 'response:completed', data });
  observer({ eventType: 'feedback:submitted', data: { ...data, feedbackType: 'positive' } });
  assert.equal(events.filter(event => event.eventType === 'ASSISTANCE_RESPONSE_COMPLETED').length, 1);
  assert.equal(conciergeMetrics(events).averageStreamingMs, 75);
  assert.equal(conciergeMetrics(events).positiveFeedback, 1);
  assert.doesNotMatch(JSON.stringify(events), /private visitor text/);
});

test('request outcomes correlate by activation ID rather than adjacent invitation ordering', () => {
  const event = (eventType: WanderlyEventType, activationId: string): WanderlyEvent => ({
    id: `${activationId}-${eventType}`, sessionId: 's', timestamp: '2026-01-01T00:00:00Z',
    eventType, page: '/', metadata: { assistanceType: 'PACKAGE_SELECTION', activationId, phase: 'opening' },
  });

  const events = [
    event('ASSISTANCE_REQUESTED', 'a1'),
    event('ASSISTANCE_FAILED', 'a1'),
    event('ASSISTANCE_REQUESTED', 'a2'),
    event('ASSISTANCE_SHOWN', 'a2'),
    event('ASSISTANCE_OPENED', 'a2'),
    event('ASSISTANCE_QUERY_SUBMITTED', 'a2'),
    event('ASSISTANCE_RESPONSE_COMPLETED', 'a1'),
  ];
  const outcomes = summariseOutcomes(events);
  assert.deepEqual(outcomes.map(outcome => outcome.response), ['FAILED', 'OPENED']);
  assert.equal(outcomes[0].completedResponses, 1);
  assert.equal(outcomes[1].completedResponses, 0);
  assert.equal(outcomes[1].queryCount, 1);
  assert.equal(conciergeMetrics(events).openingFailures, 1);
});

test('an acknowledged chat dismissal remains correlated with its delivered activation', () => {
  const lifecycle: WanderlyEventType[] = ['ASSISTANCE_REQUESTED', 'ASSISTANCE_SHOWN', 'ASSISTANCE_OPENED', 'ASSISTANCE_DISMISSED'];
  const events: WanderlyEvent[] = lifecycle.map((eventType, index) => ({
    id: String(index), sessionId: 's', timestamp: new Date(index * 1000).toISOString(), page: '/compare',
    eventType,
    metadata: { assistanceType: 'DESTINATION_COMPARISON', activationId: 'a1', reason: 'visitor' },
  }));
  assert.equal(summariseOutcomes(events)[0].response, 'DISMISSED');
  assert.equal(deriveMemory(events).visitorDismissals, 1);
});

test('known SDK interaction IDs retain their activation after a newer assistance opening', () => {
  const recorded: Record<string, unknown>[] = [];
  const router = createConciergeEventRouter((type, metadata) => { recorded.push({ type, ...metadata }); });
  router.begin({ activationId: 'old', assistanceType: 'PACKAGE_SELECTION' });
  router.receive({ eventType: 'query:submitted', data: { query: 'First question' } });
  const data = { conversationId: 'c', interactionId: 'i' };
  router.receive({ eventType: 'response:started', data });
  router.begin({ activationId: 'new', assistanceType: 'TRAVEL_INFORMATION' });
  router.receive({ eventType: 'response:completed', data });
  assert.equal(recorded.at(-1)?.activationId, 'old');
});

test('response completion before start is recorded without fabricating a streaming duration', () => {
  const recorded: Record<string, unknown>[] = [];
  const router = createConciergeEventRouter((type, metadata) => { recorded.push({ type, ...metadata }); });
  router.begin({ activationId: 'a', assistanceType: 'PACKAGE_SELECTION' });
  router.receive({ eventType: 'query:submitted', data: { query: 'Question' } });
  router.receive({ eventType: 'response:completed', data: { conversationId: 'c', interactionId: 'i' } });
  assert.equal(recorded.at(-1)?.activationId, 'a');
  assert.equal('responseMs' in recorded.at(-1)!, false);
});
