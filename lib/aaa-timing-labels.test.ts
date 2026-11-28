import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { timingOutcomeLabel, timingPointLabel, timingReasonLabels, timingVisitLimitReached } from './aaa-timing-labels.ts';

test('timing labels use human wording and never reveal unknown codes', () => {
  assert.equal(timingOutcomeLabel('safeguard', 'blocked', ['transaction.active']), 'Safeguard: booking in progress (the agent wasn’t asked)');
  assert.equal(timingOutcomeLabel('agent.failed', 'silent', []), 'Stayed silent: no usable answer from the agent');
  assert.equal(timingOutcomeLabel('safeguard', 'blocked', ['moment.not_assist']), "No help offered on this page (the agent wasn't asked)");
  assert.equal(timingOutcomeLabel('safeguard', 'blocked', ['moment.not_assist', 'transaction.active']), 'Safeguard: booking in progress (the agent wasn’t asked)');
  assert.equal(timingOutcomeLabel('rules.fallback', 'assist', []), 'Timing by rules (agent unavailable)');
  assert.equal(timingPointLabel('activity_paused'), 'activity paused');
  assert.deepEqual(timingReasonLabels(['signal.compared', 'unknown.code'], ['Bali', 'Maldives']), ['comparing Bali and Maldives']);
});

test('visit limit notice appears once only after the session timing cap is reached', () => {
  const entries = Array.from({ length: 20 }, (_, index) => ({ point: { sequence: index + 1 } }));
  assert.equal(timingVisitLimitReached(entries.slice(0, 19)), false);
  assert.equal(timingVisitLimitReached(entries), true);
  assert.equal(timingVisitLimitReached([...entries, entries.at(-1)!]), true);
  assert.equal(timingVisitLimitReached([]), false);
});
