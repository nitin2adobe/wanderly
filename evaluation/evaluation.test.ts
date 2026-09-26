import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetrics } from './evaluate-assistance.ts';
import { labelledJourneys } from '../lib/labelled-journeys.ts';

test('labelled dataset has diverse, explicit human ground truth', () => {
  assert.ok(labelledJourneys.length >= 30);
  assert.ok(new Set(labelledJourneys.map(journey => journey.category)).size >= 6);
  assert.ok(labelledJourneys.every(journey => journey.rationale && journey.labelConfidence));
  assert.ok(labelledJourneys.some(journey => journey.category === 'FALSE_POSITIVE_TRAP' && journey.expectedDecision === 'SILENT'));
});

test('evaluation metrics calculate rates and confusion matrix', () => {
  const metrics = calculateMetrics([
    { expected: 'SILENT', predicted: 'SILENT', correct: true },
    { expected: 'WAIT', predicted: 'ASSIST', correct: false },
    { expected: 'ASSIST', predicted: 'ASSIST', correct: true },
    { expected: 'ASSIST', predicted: 'SILENT', correct: false },
  ]);
  assert.equal(metrics.accuracy, 0.5);
  assert.equal(metrics.assistPrecision, 0.5);
  assert.equal(metrics.assistRecall, 0.5);
  assert.equal(metrics.unnecessaryInterruptionRate, 0);
  assert.equal(metrics.missedAssistanceRate, 0.5);
  assert.equal(metrics.confusionMatrix.ASSIST.SILENT, 1);
  assert.equal(metrics.confusionMatrix.WAIT.ASSIST, 1);
});
