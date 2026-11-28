import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDecisionPoints, isRevisit, type DecisionPoint } from './aaa-decision-points.ts';
import { travelJourney, travelSignals } from '../sites/wanderly/contract-examples.ts';

function fixture(config: Parameters<typeof createDecisionPoints>[0]['config'] = {}) {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const points: DecisionPoint[] = [];
  const scheduler = createDecisionPoints({
    now: () => now,
    setTimer: (fn, ms) => { const key = ++id; timers.set(key, { at: now + ms, fn }); return key; },
    clearTimer: timer => timers.delete(timer as number),
    onPoint: point => points.push(point), config,
  });
  const advance = (ms: number) => {
    const end = now + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = end;
  };
  return { scheduler, points, advance };
}

test('settling and activity are debounced and page changes cancel old work', () => {
  const { scheduler: s, points, advance } = fixture();
  s.pageViewed('a', false); advance(2000); s.activity('a'); advance(2499);
  assert.equal(points.length, 0); advance(1);
  assert.equal(points[0].kind, 'page_settled');
  s.activity('a'); advance(2000); s.activity('a'); advance(3000);
  assert.equal(points[1].kind, 'activity_paused');
  s.pageViewed('b', true); advance(1500);
  assert.equal(points.length, 2); advance(1500);
  assert.equal(points[2].kind, 'revisit');
  assert.equal(points[2].pageInstanceId, 'b');
});

test('visible stay time excludes hidden and paused time, and standDown preserves activity', () => {
  const { scheduler: s, points, advance } = fixture();
  s.pageViewed('a', false); advance(5000); s.visible(false); advance(50000);
  s.visible(true); advance(10000);
  assert.equal(points.at(-1)?.kind, 'long_stay');
  s.standDown('a'); s.pause(); advance(50000); s.resume(); s.activity('a'); advance(3000);
  assert.equal(points.at(-1)?.kind, 'activity_paused');
  advance(50000); assert.equal(points.filter(p => p.kind === 'long_stay').length, 1);
});

test('coalesces by priority and enforces page and session caps', () => {
  const { scheduler: s, points, advance } = fixture({
    settleMs: 1, revisitMs: 1, quietMs: 1, minGapMs: 10, longStayMs: [5, 6], perPage: 2, perSession: 3,
  });

  s.pageViewed('a', false); advance(1); s.activity('a'); advance(10);
  assert.deepEqual(points.map(p => p.kind), ['page_settled', 'activity_paused']);
  advance(100); assert.equal(points.length, 2);
  s.pageViewed('b', true); advance(10); assert.equal(points[2].kind, 'revisit');
  s.pageViewed('c', false); advance(100); assert.equal(points.length, 3);
});

test('revisits use prior page instances, not repeated activity on the same page', () => {
  const entity = travelSignals.find(signal => signal.kind === 'entity.viewed')!;
  const page = { ...travelJourney.page, pageInstanceId: 'current', pageType: 'destination-detail' };
  const current = { ...entity, pageInstanceId: 'current' };
  assert.equal(isRevisit({ ...travelJourney, page, raw: { signals: [current] } }), false);
  assert.equal(isRevisit({ ...travelJourney, page, raw: { signals: [current, { ...entity, pageInstanceId: 'old' }] } }), true);
  assert.equal(isRevisit({ ...travelJourney, page: { ...page, pageType: 'comparison' }, raw: { signals: [
    { ...travelSignals[0], pageType: 'comparison', pageInstanceId: 'old' },
  ] } }), true);
});

test('a late entity signal identifies a revisit before the first decision', () => {
  const { scheduler: s, points, advance } = fixture();
  s.pageViewed('a', false);
  advance(500);
  s.activity('a', true);
  advance(1499);
  assert.equal(points.length, 0);
  advance(1);
  assert.equal(points[0].kind, 'revisit');
});

test('stop and page change cancel pending old-page decisions', () => {
  const { scheduler: s, points, advance } = fixture();
  s.pageViewed('a', false); advance(1000);
  s.pageViewed('b', false); advance(2500);
  assert.deepEqual(points.map(p => p.pageInstanceId), ['b']);
  s.stop(); advance(50000);
  assert.equal(points.length, 1);
});

test('a restored sequence retains the session cap', () => {
  const points: DecisionPoint[] = [];
  let now = 0;
  let callback: (() => void) | undefined;
  const s = createDecisionPoints({
    now: () => now, setTimer: fn => { callback = fn; return 1; }, clearTimer: () => {},
    initialSequence: 19, onPoint: point => points.push(point),
  });
  s.pageViewed('a', false);
  now = 2500; callback!();
  assert.equal(points[0].sequence, 20);
  s.pageViewed('b', false); now += 50000;
  assert.equal(points.length, 1);
});
