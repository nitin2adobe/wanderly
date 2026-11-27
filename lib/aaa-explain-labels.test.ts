import assert from 'node:assert/strict';
import test from 'node:test';
import { decisionDetails, explainReason, provenanceLabel } from './aaa-explain-labels.ts';

test('explain labels do not invent a source or expose unrecognized codes', () => {
  assert.equal(provenanceLabel('generated'), 'Chosen by the agent · passed checks');
  assert.equal(provenanceLabel('approved'), 'Approved example');
  assert.equal(provenanceLabel('other'), 'Source not recorded');
  assert.equal(explainReason('model.disabled'), 'Model switched off (templates only)');
  assert.equal(explainReason('unknown.code'), undefined);
});

test('decision details show a differing rules choice and only known rationale codes', () => {
  assert.deepEqual(decisionDetails('destination-compare', 'cost-focus', [
    'signal.price_focus', 'facet.explicit', 'signal.back_and_forth', 'signal.info_seeking', 'unknown', 'signal.price_focus',
  ]), {
    rulesChoice: 'Rules would have chosen: Destination compare',
    reasons: [
      'because the visitor checked prices', 'because the visitor chose a preference',
      'because the visitor revisited options', 'because the visitor sought more information',
    ],
  });
  assert.deepEqual(decisionDetails('destination-compare', 'destination-compare', null), { rulesChoice: undefined, reasons: [] });
  assert.equal(decisionDetails('destination-compare', null, []).rulesChoice, undefined);
});
