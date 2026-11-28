// Based on aaa-timing-replay-reference.ts. This is a scripted pipeline check, not a model evaluation.
// Each event is approximated as a decision point 3s after it, with events 4s apart.
// There are no long-stay points, hidden tabs, form focus, chat, or dismissals in this dataset.
// Compare selection is inferred from the last two distinct destinations when absent;
// DATE_SEARCH changes page but emits no signal. Same-URL page views reuse the runtime page.
import { basename } from 'node:path';
import { createJourneyRuntime } from '../aaa/runtime.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '../aaa/profile/loader.ts';
import type { JourneyState } from '../aaa/contracts/types.ts';
import { labelledJourneys, type LabelledJourney } from '../lib/labelled-journeys.ts';
import { pageForEvent } from '../lib/demo-scenarios.ts';
import { getDestination, getPackage } from '../lib/data.ts';
import { faqDestinationId } from '../sites/wanderly/signals.ts';
import { swapJourney } from './timing-swap-fixture.ts';
import profile from '../sites/wanderly/profile.json' with { type: 'json' };

type PointKind = 'page_settled' | 'activity_paused' | 'revisit';
type JudgeInput = { journey: JourneyState; point: PointKind; secondsOnPage: number };
export type ScriptedJudge = (input: JudgeInput) => 'assist' | 'silent';
type Trace = {
  eventIndex: number; event: string; point: PointKind; secondsOnPage: number;
  outcome: 'assist' | 'silent' | 'blocked'; reasonCodes: string[]; rule?: string;
  invalidComparisonSelection: boolean;
  transaction: JourneyState['derived']['inProgress']['status'] | 'unavailable';
};
type Replay = { id: string; label: LabelledJourney['expectedDecision']; stepInFrom?: number; calls: number; trace: Trace[] };

const pageTypeForPath = (path: string) => path === '/' ? 'home' : path === '/booking' ? 'booking' : path === '/destinations' ? 'destination-list'
  : path.startsWith('/destinations/') ? 'destination-detail' : path === '/packages' ? 'package-list' : path.startsWith('/packages/') ? 'package-detail'
  : path === '/compare' ? 'comparison' : path === '/travel-info' ? 'practical-info' : 'other';

// Deliberately simple fixture based only on observed canonical signals, never labels or future events.
export const scriptedJudge: ScriptedJudge = ({ journey }) => {
  const signals = journey.raw.signals;
  const views = signals.filter(s => s.kind === 'entity.viewed');
  const comparisons = signals.filter(s => s.kind === 'entity.compared').length;
  const info = signals.filter(s => s.kind === 'info.sought');
  return (comparisons > 0 && views.length >= 3)
    || info.filter(s => s.kind === 'info.sought' && s.attributes.topicId === 'practical-planning').length >= 3
    || (views.filter(s => s.kind === 'entity.viewed' && s.attributes.entityType === 'package').length >= 3
      && info.filter(s => s.kind === 'info.sought' && s.attributes.topicId === 'sample-price').length >= 2)
    ? 'assist' : 'silent';
};

export function replayJourney(j: LabelledJourney, mode: 'rules' | 'scripted', judge: ScriptedJudge = scriptedJudge): Replay {
  const registry = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY });
  registry.publish(profile);
  const state = registry.state();
  if (!state.enabled) throw new Error('profile not active');
  let t = 1_800_000_000_000;
  let n = 0;
  const storage = new Map<string, string>();
  const rt = createJourneyRuntime({
    availability: () => ({ consent: 'granted', active: state.active }),
    sessionId: () => `session-${j.id}`, now: () => t, makeId: () => `id-${++n}`,
    storage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: k => void storage.delete(k) },
    terminalConfirmed: s => s.kind === 'transaction.step' && !!s.attributes.flowId,
  });
  let path = '/';
  let selection: string[] = [];
  const viewed: string[] = [];
  const seenEntities = new Set<string>();
  let seenComparison = false;
  let pageStart = t;
  let calls = 0;
  const trace: Trace[] = [];
  j.events.forEach(([type, entity], eventIndex) => {
    t = 1_800_000_000_000 + eventIndex * 4000;
    const target = pageForEvent(type, entity);
    const keepPage = type === 'HOTEL_VIEW' || type === 'COMPARE_ADD' || type === 'COMPARE_REMOVE';
    const revisit = (type === 'DESTINATION_VIEW' || type === 'PACKAGE_VIEW') && !!entity && seenEntities.has(`${type}:${entity}`)
      || type === 'COMPARE_VIEW' && seenComparison;
    if (!keepPage) path = target.split('?')[0];
    const oldPage = rt.getPage()?.pageInstanceId;
    rt.setPage(pageTypeForPath(path), keepPage ? path : target);
    if (rt.getPage()?.pageInstanceId !== oldPage) pageStart = t;
    const ids = entity ? [entity] : [];
    switch (type) {
      case 'DESTINATION_VIEW': if (entity && getDestination(entity)) { rt.track('destination.viewed', { entityIds: ids }); viewed.push(entity); seenEntities.add(`${type}:${entity}`); } break;
      case 'PACKAGE_VIEW': if (entity && getPackage(entity)) { rt.track('package.viewed', { entityIds: ids }); seenEntities.add(`${type}:${entity}`); } break;
      case 'TRAVEL_INFO_VIEW': rt.track('info.sought', { entityIds: ids, topicId: 'practical-planning' }); break;
      case 'FAQ_SEARCH': { const d = faqDestinationId(entity); rt.track('info.sought', { entityIds: d ? [d] : [], topicId: 'practical-planning' }); break; }
      case 'PRICE_VIEW': rt.track('info.sought', { entityIds: ids, topicId: 'sample-price' }); break;
      case 'COMPARE_ADD': if (entity && !selection.includes(entity)) selection.push(entity); if (selection.length >= 2) rt.track('entities.compared', { entityIds: selection.slice(0, 2), entityType: 'destination' }); else rt.revise(); break;
      case 'COMPARE_REMOVE': selection = selection.filter(s => s !== entity); rt.revise(); break;
      case 'COMPARE_VIEW':
        seenComparison = true;
        if (selection.length < 2) selection = [...new Set(viewed)].slice(-2);
        if (selection.length >= 2) rt.track('entities.compared', { entityIds: selection.slice(0, 2), entityType: 'destination' }); else rt.revise();
        break;
      case 'DATE_SEARCH': break;
      case 'BOOKING_START': rt.track('booking.started', { flowId: `flow-${j.id}` }); break;
    }
    t += 3000;
    const point: PointKind = keepPage ? 'activity_paused' : revisit ? 'revisit' : 'page_settled';
    const moment = rt.getMoment();
    const suppression = rt.evaluate();
    const journey = rt.getJourney();
    const validSelection = pageTypeForPath(path) !== 'comparison' || selection.length === 2;
    const allowed = !!journey && !!moment && moment.decision === 'ASSIST' && suppression.allowed && validSelection;
    const reasonCodes = !moment || moment.decision !== 'ASSIST' ? ['moment.not_assist']
      : !validSelection ? ['comparison.invalid_selection'] : suppression.reasonCodes;
    let outcome: Trace['outcome'] = 'blocked';
    if (allowed && journey) {
      if (mode === 'scripted') calls++;
      outcome = mode === 'rules' ? 'assist' : judge({ journey, point, secondsOnPage: (t - pageStart) / 1000 });
      if (outcome === 'assist' && !rt.shown().allowed) throw new Error('Suppression changed before recording a step-in');
    }
    trace.push({ eventIndex, event: `${type}${entity ? `:${entity}` : ''}`, point, secondsOnPage: (t - pageStart) / 1000,
      outcome, reasonCodes, invalidComparisonSelection: !validSelection,
      ...(moment ? { rule: moment.id } : {}), transaction: journey?.derived.inProgress.status ?? 'unavailable' });
  });
  return { id: j.id, label: j.expectedDecision, ...(j.stepInFrom === undefined ? {} : { stepInFrom: j.stepInFrom }), calls, trace };
}

export function summarize(rows: Replay[]) {
  const nonAssist = rows.filter(r => r.label !== 'ASSIST');
  const unreachable = rows.filter(r => r.label === 'ASSIST' && r.stepInFrom !== undefined
    && r.trace[r.stepInFrom]?.invalidComparisonSelection);
  const reachable = rows.filter(r => !unreachable.includes(r));
  const assist = reachable.filter(r => r.label === 'ASSIST');
  const first = (r: Replay) => r.trace.find(p => p.outcome === 'assist')?.eventIndex;
  const counts = rows.map(r => r.calls).sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  return {
    premature: { count: nonAssist.filter(r => first(r) !== undefined).length, total: nonAssist.length },
    earlyAssist: assist.filter(r => { const i = first(r); return i !== undefined && r.stepInFrom !== undefined && i < r.stepInFrom; }).length,
    onTime: { count: assist.filter(r => { const i = first(r); return i !== undefined && r.stepInFrom !== undefined && i >= r.stepInFrom; }).length, total: assist.length },
    missed: assist.filter(r => first(r) === undefined).length,
    unreachable: { count: unreachable.length, journeyIds: unreachable.map(r => r.id) },
    endAgreement: { count: reachable.filter(r => (r.label === 'ASSIST') === (r.trace.at(-1)?.outcome === 'assist')).length, total: reachable.length },
    callsPerJourney: { median: counts.length ? (counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2) : 0, max: counts.at(-1) ?? 0 },
    latencyMs: null,
    stepInsAfterBooking: rows.reduce((sum, r) => {
      const start = r.trace.findIndex(p => p.event === 'BOOKING_START');
      return sum + (start < 0 ? 0 : r.trace.slice(start).filter(p => p.outcome === 'assist').length);
    }, 0),
  };
}

export function runScriptedReplay(journeys: LabelledJourney[] = labelledJourneys) {
  for (const j of journeys) {
    if (j.expectedDecision === 'ASSIST' && (!Number.isInteger(j.stepInFrom) || j.stepInFrom! < 0 || j.stepInFrom! >= j.events.length)) throw new Error(`Missing or invalid stepInFrom: ${j.id}`);
  }
  const rules = journeys.map(j => replayJourney(j, 'rules'));
  const scripted = journeys.map(j => replayJourney(j, 'scripted'));
  const swapMismatches = journeys.flatMap((j, i) => (['rules', 'scripted'] as const).flatMap(mode => {
    const original = mode === 'rules' ? rules[i] : scripted[i];
    const swapped = replayJourney(swapJourney(j), mode);
    const decisions = (row: Replay) => row.trace.map(p => ({
      point: p.point, outcome: p.outcome, reasonCodes: p.reasonCodes,
      rule: p.rule, invalidComparisonSelection: p.invalidComparisonSelection, transaction: p.transaction,
    }));
    return JSON.stringify(decisions(original)) === JSON.stringify(decisions(swapped)) && original.calls === swapped.calls
      ? [] : [{ id: j.id, mode }];
  }));
  const report = (rows: Replay[]) => ({
    metrics: summarize(rows),
    nonHoldout: summarize(rows.filter(row => !row.id.startsWith('holdout-'))),
    holdout: summarize(rows.filter(row => row.id.startsWith('holdout-'))),
    journeys: rows,
  });
  return { description: 'single scripted replay of labelled journeys', labels: 'approved', approximations: [
    '4 seconds between events; one approximated decision point per event, 3 seconds after the event; no long-stay points.',
    'Comparison selection inferred from the last two distinct destinations; DATE_SEARCH emits no signal; same-URL page views reuse the runtime page.',
    'No hidden tabs, form focus, chat or dismissals; actual runtime suppression and exposure budgets are applied.',
    'Scripted judge is a deterministic pipeline fixture, not a model or live timing result; latency is not measured.',
    'Unreachable means invalid comparison selection at the labelled moment; such journeys are excluded from assist and agreement denominators.',
  ], destinationSwap: { passed: swapMismatches.length === 0, mismatches: swapMismatches },
  rules: report(rules), scripted: report(scripted) };
}

if (basename(process.argv[1] || '') === 'replay-timing.ts') {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--judge' || args[1] !== 'scripted') {
    console.error('Only --judge scripted is supported; live evaluation is not authorized.');
    process.exitCode = 1;
  } else {
    const report = runScriptedReplay();
    console.log(JSON.stringify(report, null, 2));
    if (!report.destinationSwap.passed) process.exitCode = 1;
  }
}
