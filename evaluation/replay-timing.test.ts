import assert from 'node:assert/strict';
import test from 'node:test';
import { labelledJourneys, type LabelledJourney } from '../lib/labelled-journeys.ts';
import { replayJourney, runScriptedReplay } from './replay-timing.ts';

const journey = (id: string) => {
  const found = labelledJourneys.find(j => j.id === id);
  assert.ok(found);
  return found;
};

test('all and only ASSIST journeys have in-range proposed labels', () => {
  const assist = labelledJourneys.filter(j => j.expectedDecision === 'ASSIST');
  assert.equal(assist.length, 11);
  assert.ok(assist.every(j => Number.isInteger(j.stepInFrom) && j.stepInFrom! >= 0 && j.stepInFrom! < j.events.length));
  assert.ok(labelledJourneys.filter(j => j.expectedDecision !== 'ASSIST').every(j => j.stepInFrom === undefined));
});

test('scripted replay is deterministic and covers the real dataset without model latency', () => {
  const first = runScriptedReplay();
  assert.deepEqual(runScriptedReplay(), first);
  assert.equal(first.scripted.journeys.length, 37);
  assert.equal(first.rules.metrics.premature.count, 26);
  assert.equal(first.scripted.metrics.latencyMs, null);
  assert.equal(first.scripted.metrics.stepInsAfterBooking, 0);
});

test('runtime suppression prevents subsequent calls after a shown nudge and booking', () => {
  let calls = 0;
  const row = replayJourney(journey('healthy-maldives-booking'), 'scripted', () => { calls++; return 'assist'; });
  assert.equal(calls, 1);
  assert.equal(row.trace[0].outcome, 'assist');
  assert.equal(row.trace[1].outcome, 'blocked');
  assert.equal(row.trace[2].outcome, 'blocked');
  assert.equal(row.trace[2].transaction, 'active');
});

test('exposure cooldown blocks eligible later pages before the judge', () => {
  const row = replayJourney(journey('compare-bali-maldives-loop'), 'scripted', () => 'assist');
  assert.equal(row.calls, 1);
  assert.equal(row.trace[1].outcome, 'blocked');
  assert.ok(row.trace[1].reasonCodes.includes('exposure.cooldown'));
});

test('active booking blocks the judge even after returning to an eligible page', () => {
  const source: LabelledJourney = {
    ...journey('healthy-maldives-booking'),
    events: [['DESTINATION_VIEW', 'maldives'], ['BOOKING_START'], ['DESTINATION_VIEW', 'bali']],
  };
  let calls = 0;
  const row = replayJourney(source, 'scripted', () => { calls++; return 'silent'; });
  assert.equal(calls, 1);
  assert.equal(row.trace[2].outcome, 'blocked');
  assert.equal(row.trace[2].transaction, 'active');
  assert.ok(row.trace[2].reasonCodes.includes('transaction.active'));
});

test('invalid comparison selection is blocked before invoking the judge', () => {
  const source: LabelledJourney = {
    ...journey('assist-explicit-compare'),
    events: [['DESTINATION_VIEW', 'bali'], ['DESTINATION_VIEW', 'maldives'], ['COMPARE_VIEW'], ['COMPARE_REMOVE', 'maldives']],
  };
  const candidate: LabelledJourney = { ...source, events: source.events.slice(0, -1) };
  let calls = 0;
  const before = replayJourney(candidate, 'scripted', () => { calls++; return 'silent'; }).calls;
  const replay = replayJourney(source, 'scripted', () => { calls++; return 'silent'; });
  assert.equal(replay.calls, before);
  assert.equal(calls, before * 2);
  assert.equal(replay.trace.at(-1)?.outcome, 'blocked');
  assert.deepEqual(replay.trace.at(-1)?.reasonCodes, ['comparison.invalid_selection']);
});

test('replay distinguishes revisits, on-page activity and settled pages', () => {
  const trace = replayJourney(journey('assist-explicit-compare'), 'scripted', () => 'silent').trace;
  assert.deepEqual(trace.map(p => p.point), ['page_settled', 'page_settled', 'page_settled', 'activity_paused', 'activity_paused']);
  assert.equal(replayJourney(journey('compare-bali-maldives-loop'), 'scripted', () => 'silent').trace[2].point, 'revisit');
});
