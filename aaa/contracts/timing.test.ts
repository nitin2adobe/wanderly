import assert from 'node:assert/strict';
import test from 'node:test';
import request from './timing/moment-request-1.example.json' with { type: 'json' };
import result from './timing/moment-result-1.example.json' with { type: 'json' };
import { validateContract } from './validate.ts';

test('authoritative timing examples validate with the frozen starter contract', () => {
  assert.equal(validateContract('MomentRequest', request).valid, true);
  assert.equal(validateContract('MomentResult', result).valid, true);
});

test('timing schemas enforce numeric bounds and source-specific output', () => {
  assert.equal(validateContract('MomentRequest', { ...request, decisionPoint: { ...request.decisionPoint, pageSequence: 5 } }).valid, false);
  assert.equal(validateContract('MomentRequest', { ...request, exposure: { shownThisSession: 101 } }).valid, false);
  assert.equal(validateContract('MomentRequest', { ...request, request: { ...request.request, unexpected: 'text' } }).valid, false);
  assert.equal(validateContract('MomentResult', { ...result, source: 'safeguard', decision: 'assist' }).valid, false);
  assert.equal(validateContract('MomentResult', { ...result, source: 'agent.failed', decision: 'silent' }).valid, false);
  const { judgments, confidence, modelRecommendation, ...safe } = result;
  assert.equal(validateContract('MomentResult', { ...safe, source: 'agent.failed', decision: 'silent' }).valid, true);
  assert.equal(validateContract('MomentResult', { ...safe, source: 'agent', decision: 'silent' }).valid, false);
});
