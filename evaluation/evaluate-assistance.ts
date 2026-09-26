import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildJourneyContext } from '../lib/journey-context.ts';
import { decideAssistance } from '../lib/assistance-decision.ts';
import type { AssistanceDecisionSchema } from '../lib/assistance-schema.ts';
import { reasonAboutAssistance } from '../lib/assistance-reasoner.ts';
import { selectLLMProvider, type ProviderSelection } from '../lib/llm-provider.ts';
import { journeyEvents, labelledJourneys, type LabelledJourney } from '../lib/labelled-journeys.ts';

export type Outcome = {
  expected: LabelledJourney['expectedDecision'];
  predicted: LabelledJourney['expectedDecision'];
  correct: boolean;
};

export type Metrics = {
  total: number;
  accuracy: number;
  assistPrecision: number;
  assistRecall: number;
  unnecessaryInterruptionRate: number;
  missedAssistanceRate: number;
  waitAccuracy: number;
  silentAccuracy: number;
  confusionMatrix: Record<string, Record<string, number>>;
};

export function calculateMetrics(outcomes: Outcome[]): Metrics {
  const total = outcomes.length;
  const count = (predicate: (o: Outcome) => boolean) => outcomes.filter(predicate).length;
  const expectedAssist = count(o => o.expected === 'ASSIST');
  const predictedAssist = count(o => o.predicted === 'ASSIST');
  const expectedWait = count(o => o.expected === 'WAIT');
  const expectedSilent = count(o => o.expected === 'SILENT');
  const matrix: Record<string, Record<string, number>> = {
    SILENT: { SILENT: 0, WAIT: 0, ASSIST: 0 },
    WAIT: { SILENT: 0, WAIT: 0, ASSIST: 0 },
    ASSIST: { SILENT: 0, WAIT: 0, ASSIST: 0 },
  };
  for (const outcome of outcomes) matrix[outcome.expected][outcome.predicted]++;
  const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
  return {
    total,
    accuracy: rate(count(o => o.correct), total),
    assistPrecision: rate(count(o => o.predicted === 'ASSIST' && o.expected === 'ASSIST'), predictedAssist),
    assistRecall: rate(count(o => o.predicted === 'ASSIST' && o.expected === 'ASSIST'), expectedAssist),
    unnecessaryInterruptionRate: rate(count(o => o.predicted === 'ASSIST' && o.expected === 'SILENT'), expectedSilent),
    missedAssistanceRate: rate(count(o => o.predicted === 'SILENT' && o.expected === 'ASSIST'), expectedAssist),
    waitAccuracy: rate(count(o => o.predicted === 'WAIT' && o.expected === 'WAIT'), expectedWait),
    silentAccuracy: rate(count(o => o.predicted === 'SILENT' && o.expected === 'SILENT'), expectedSilent),
    confusionMatrix: matrix,
  };
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

function parseArgs(args: string[]) {
  const runsArg = args.find(arg => arg.startsWith('--runs='));
  const runs = Math.max(1, Math.min(20, Number(runsArg?.split('=')[1] || 1)));
  return { runs, live: args.includes('--live') };
}

async function evaluateModel(selection: ProviderSelection, runs: number) {
  const results = [];
  const latencies: number[] = [];
  for (let index = 0; index < labelledJourneys.length; index++) {
    const journey = labelledJourneys[index];
    const context = buildJourneyContext(journeyEvents(journey.events, index));
    const decisions: AssistanceDecisionSchema[] = [];
    const usages = [];
    const journeyLatencies: number[] = [];
    for (let run = 0; run < runs; run++) {
      const started = performance.now();
      const result = await reasonAboutAssistance(context, selection);
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      latencies.push(latencyMs);
      journeyLatencies.push(latencyMs);
      decisions.push(result.decision);
      if (result.usage) usages.push(result.usage);
    }
    const counts = decisions.reduce<Record<string, number>>((acc, decision) => {
      acc[decision.decision] = (acc[decision.decision] || 0) + 1;
      return acc;
    }, {});
    results.push({
      id: journey.id,
      name: journey.name,
      expected: journey.expectedDecision,
      expectedAssistanceType: journey.expectedAssistanceType,
      labelConfidence: journey.labelConfidence,
      decisions: decisions.map(decision => decision.decision),
      decisionCounts: counts,
      reasons: [...new Set(decisions.map(decision => decision.reason))],
      latenciesMs: journeyLatencies,
      usages,
    });
  }
  return { results, latencies };
}

function metricsForResults(results: Array<{ expected: Outcome['expected']; decisions: string[] }>): Metrics {
  return calculateMetrics(results.map(result => ({ expected: result.expected, predicted: result.decisions[0] as Outcome['predicted'], correct: result.decisions[0] === result.expected })));
}

function printModelReport(label: string, metrics: Metrics) {
  console.log(`\n${label}`);
  console.log(`Accuracy ${(metrics.accuracy * 100).toFixed(1)}% | ASSIST precision ${(metrics.assistPrecision * 100).toFixed(1)}% | ASSIST recall ${(metrics.assistRecall * 100).toFixed(1)}%`);
  console.log(`Unnecessary interruption ${(metrics.unnecessaryInterruptionRate * 100).toFixed(1)}% | Missed assistance ${(metrics.missedAssistanceRate * 100).toFixed(1)}% | WAIT accuracy ${(metrics.waitAccuracy * 100).toFixed(1)}% | SILENT accuracy ${(metrics.silentAccuracy * 100).toFixed(1)}%`);
  console.log('Confusion matrix (expected -> predicted):', JSON.stringify(metrics.confusionMatrix));
}

async function main() {
  const { runs, live } = parseArgs(process.argv.slice(2));
  const selection = selectLLMProvider();
  if (live && selection.mode !== 'live') throw new Error('Live evaluation requested, but OpenAI credentials/configuration are missing.');
  console.log(`Evaluating ${labelledJourneys.length} labelled journeys for ${runs} run(s) with ${selection.provider.name}/${selection.provider.model} (${selection.mode}).`);
  const ruleResults = labelledJourneys.map((journey, index) => {
    const decision = decideAssistance(buildJourneyContext(journeyEvents(journey.events, index)));
    return { id: journey.id, name: journey.name, expected: journey.expectedDecision, predicted: decision.decision, correct: decision.decision === journey.expectedDecision, reason: decision.reason };
  });
  const ai = await evaluateModel(selection, runs);
  const ruleMetrics = calculateMetrics(ruleResults);
  const aiMetrics = metricsForResults(ai.results);
  printModelReport('RULE BASELINE', ruleMetrics);
  printModelReport('AI REASONER (first run)', aiMetrics);

  console.log('\nDISAGREEMENTS');
  for (const journey of labelledJourneys) {
    const rule = ruleResults.find(result => result.id === journey.id)!;
    const aiResult = ai.results.find(result => result.id === journey.id)!;
    if (rule.predicted !== aiResult.decisions[0] || rule.predicted !== journey.expectedDecision) {
      console.log(`${journey.id} "${journey.name}" | Expected ${journey.expectedDecision} | Rules ${rule.predicted} ${rule.correct ? 'PASS' : 'FAIL'} | AI ${aiResult.decisions[0]} ${aiResult.decisions[0] === journey.expectedDecision ? 'PASS' : 'FAIL'}`);
      console.log(`  AI reason: ${aiResult.reasons[0]}`);
    }
  }
  if (runs > 1) {
    console.log('\nSTABILITY');
    for (const result of ai.results) {
      const distribution = Object.entries(result.decisionCounts).map(([decision, count]) => `${decision} ${count}/${runs}`).join(', ');
      if (Object.keys(result.decisionCounts).length > 1) console.log(`${result.id}: ${distribution}`);
    }
  }
  const timestamp = new Date().toISOString();
  const allLatencies = ai.latencies;
  const report = {
    timestamp,
    provider: selection.provider.name,
    model: selection.provider.model,
    mode: selection.mode,
    datasetVersion: 'phase-c-v1',
    runs,
    summary: { rules: ruleMetrics, ai: aiMetrics },
    latencyMs: { average: allLatencies.reduce((sum, value) => sum + value, 0) / (allLatencies.length || 1), p50: percentile(allLatencies, 0.5), p95: percentile(allLatencies, 0.95) },
    tokenUsage: ai.results.flatMap(result => result.usages || []).length ? ai.results.flatMap(result => result.usages || []) : null,
    journeys: labelledJourneys.map(journey => ({
      ...journey,
      rule: ruleResults.find(result => result.id === journey.id),
      ai: ai.results.find(result => result.id === journey.id),
    })),
  };
  await mkdir('evaluation/results', { recursive: true });
  await writeFile('evaluation/results/latest.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nSaved evaluation/results/latest.json. AI latency average ${report.latencyMs.average.toFixed(1)}ms, P50 ${report.latencyMs.p50.toFixed(1)}ms, P95 ${report.latencyMs.p95.toFixed(1)}ms.`);
}

if (basename(process.argv[1] || '') === 'evaluate-assistance.ts') {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
