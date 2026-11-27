import assert from 'node:assert/strict';
import test from 'node:test';
import { explainReason, provenanceLabel } from './aaa-explain-labels.ts';

test('explain labels do not invent a source or expose unrecognized codes', () => {
  assert.equal(provenanceLabel('generated'), 'Chosen by the agent · passed checks');
  assert.equal(provenanceLabel('approved'), 'Approved example');
  assert.equal(provenanceLabel('other'), 'Source not recorded');
  assert.equal(explainReason('model.disabled'), 'Model switched off (templates only)');
  assert.equal(explainReason('unknown.code'), undefined);
});
