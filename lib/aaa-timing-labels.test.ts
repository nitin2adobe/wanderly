import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { timingOutcomeLabel, timingPointLabel, timingReasonLabels } from './aaa-timing-labels.ts';

test('timing labels use human wording and never reveal unknown codes', () => {
  assert.equal(timingOutcomeLabel('safeguard', 'blocked', ['transaction.active']), 'Safeguard: booking in progress (the agent wasn’t asked)');
  assert.equal(timingOutcomeLabel('agent.failed', 'silent', []), 'Stayed silent: agent didn’t answer in time');
  assert.equal(timingOutcomeLabel('rules.fallback', 'assist', []), 'Timing by rules (agent unavailable)');
  assert.equal(timingPointLabel('activity_paused'), 'activity paused');
  assert.deepEqual(timingReasonLabels(['signal.compared', 'unknown.code'], ['Bali', 'Maldives']), ['comparing Bali and Maldives']);
});
