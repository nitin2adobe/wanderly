import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecisionResult } from './assistance-decision.ts';
import { agreementFor, summariseAgreement, type ComparisonRow } from './proposal-comparison.ts';

const d = (decision: DecisionResult['decision'], assistanceType: DecisionResult['assistanceType'] = 'NONE'): DecisionResult =>
  ({ decision, assistanceType, confidence: 0.9, headline: 'h', reason: 'r', evidence: [] });
const row = (rules: DecisionResult, ai: DecisionResult, source: ComparisonRow['source'] = 'ai-mock') => ({ rules, ai, source });

test('agreement needs the same decision and the same assistance type', () => {
  assert.equal(agreementFor(row(d('SILENT'), d('SILENT'))), 'AGREE');
  assert.equal(agreementFor(row(d('ASSIST', 'DESTINATION_COMPARISON'), d('ASSIST', 'DESTINATION_COMPARISON'))), 'AGREE');
  assert.equal(agreementFor(row(d('ASSIST', 'DESTINATION_COMPARISON'), d('WAIT'))), 'DISAGREE');
  assert.equal(agreementFor(row(d('ASSIST', 'DESTINATION_COMPARISON'), d('ASSIST', 'PACKAGE_SELECTION'))), 'DISAGREE');
});

test('an AI outage is never counted as agreement', () => {
  const fallback = row(d('WAIT'), d('WAIT'), 'rules-fallback');
  assert.equal(agreementFor(fallback), 'UNAVAILABLE');
  assert.deepEqual(summariseAgreement([fallback, row(d('WAIT'), d('WAIT')), row(d('ASSIST', 'DESTINATION_COMPARISON'), d('WAIT'))]),
    { total: 3, agreed: 1, disagreed: 1, unavailable: 1 });
});

test('an empty comparison summarises to zeros', () => {
  assert.deepEqual(summariseAgreement([]), { total: 0, agreed: 0, disagreed: 0, unavailable: 0 });
});
