import type { JourneyState } from '../aaa/contracts/types.ts';

export type DecisionPointKind = 'page_settled' | 'activity_paused' | 'long_stay' | 'revisit';
export type DecisionPoint = { kind: DecisionPointKind; sequence: number; pageSequence: number; pageInstanceId: string };
export const TIMING_VISIT_LIMIT = 20;
export type DecisionPointConfig = {
  settleMs: number; revisitMs: number; quietMs: number; minGapMs: number;
  longStayMs: number[]; perPage: number; perSession: number;
};
export function isRevisit(journey: JourneyState): boolean {
  const { page, raw } = journey;
  if (page.pageType === 'comparison'
    && raw.signals.some(signal => signal.pageType === 'comparison' && signal.pageInstanceId !== page.pageInstanceId)) return true;
  const currentIds = new Set(raw.signals
    .filter(signal => signal.kind === 'entity.viewed' && signal.pageInstanceId === page.pageInstanceId)
    .flatMap(signal => signal.entityIds));
  return raw.signals.some(signal => signal.kind === 'entity.viewed'
    && signal.pageInstanceId !== page.pageInstanceId && signal.entityIds.some(id => currentIds.has(id)));
}

const defaults: DecisionPointConfig = {
  settleMs: 2500, revisitMs: 1500, quietMs: 3000, minGapMs: 3000,
  longStayMs: [15000, 40000], perPage: 4, perSession: TIMING_VISIT_LIMIT,
};
const priority: DecisionPointKind[] = ['revisit', 'activity_paused', 'long_stay', 'page_settled'];

export function createDecisionPoints(opts: {
  now: () => number; setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (timer: unknown) => void;
  onPoint: (point: DecisionPoint) => void; config?: Partial<DecisionPointConfig>; initialSequence?: number;
}) {
  const config = { ...defaults, ...opts.config };
  let page = '', sequence = opts.initialSequence ?? 0, pageSequence = 0, lastPoint = -Infinity;
  let visible = true, paused = false, stopped = false, settled = false, revisiting = false;
  let elapsed = 0, clock = opts.now(), settleAt: number | undefined, quietAt: number | undefined;
  let stayIndex = 0, timer: unknown;
  const pending = new Set<DecisionPointKind>();

  const clear = () => { if (timer !== undefined) opts.clearTimer(timer); timer = undefined; };
  const updateClock = () => {
    const now = opts.now();
    if (visible && !paused && page) elapsed += Math.max(0, now - clock);
    clock = now;
  };
  const run = () => {
    clear();
    updateClock();
    if (stopped || !visible || paused || !page || sequence >= config.perSession || pageSequence >= config.perPage) return;
    if (!settled && settleAt !== undefined && elapsed >= settleAt) {
      settled = true;
      settleAt = undefined;
      pending.add(revisiting ? 'revisit' : 'page_settled');
    }
    if (quietAt !== undefined && elapsed >= quietAt) {
      quietAt = undefined;
      pending.add('activity_paused');
    }
    while (stayIndex < config.longStayMs.length && elapsed >= config.longStayMs[stayIndex]) {
      pending.add('long_stay');
      stayIndex++;
    }
    const now = opts.now();
    if (pending.size && now >= lastPoint + config.minGapMs) {
      const kind = priority.find(item => pending.has(item))!;
      pending.clear();
      lastPoint = now;
      opts.onPoint({ kind, sequence: ++sequence, pageSequence: ++pageSequence, pageInstanceId: page });
      if (stopped || paused || !visible || sequence >= config.perSession || pageSequence >= config.perPage) return;
    }
    const deadlines: number[] = [];
    if (settleAt !== undefined) deadlines.push(Math.max(0, settleAt - elapsed));
    if (quietAt !== undefined) deadlines.push(Math.max(0, quietAt - elapsed));
    if (stayIndex < config.longStayMs.length) deadlines.push(Math.max(0, config.longStayMs[stayIndex] - elapsed));
    if (pending.size) deadlines.push(Math.max(0, lastPoint + config.minGapMs - now));
    if (deadlines.length) timer = opts.setTimer(run, Math.min(...deadlines));
  };

  return {
    pageViewed(pageInstanceId: string, revisit: boolean) {
      clear();
      page = pageInstanceId; pageSequence = 0; elapsed = 0; clock = opts.now();
      settled = false; revisiting = revisit; stayIndex = 0; quietAt = undefined;
      pending.clear();
      settleAt = revisit ? config.revisitMs : config.settleMs;
      run();
    },
    activity(pageInstanceId: string, revisit = false) {
      if (page !== pageInstanceId || stopped) return;
      updateClock();
      if (!settled && revisit) revisiting = true;
      if (!settled) settleAt = elapsed + (revisiting ? config.revisitMs : config.settleMs);
      else quietAt = elapsed + config.quietMs;
      run();
    },
    visible(isVisible: boolean) { updateClock(); visible = isVisible; run(); },
    pause() { updateClock(); paused = true; run(); },
    resume() { updateClock(); paused = false; run(); },
    standDown(pageInstanceId: string) {
      if (page !== pageInstanceId) return;
      stayIndex = config.longStayMs.length;
      pending.delete('long_stay');
      run();
    },
    stop() { stopped = true; clear(); pending.clear(); },
  };
}
