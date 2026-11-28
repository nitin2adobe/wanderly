import assert from 'node:assert/strict';
import test from 'node:test';
import { consideredReasons, decisionDetails, explainReason, provenanceLabel } from './aaa-explain-labels.ts';

test('explain labels do not invent a source or expose unrecognized codes', () => {
  assert.equal(provenanceLabel('generated'), 'Chosen by the agent · passed checks');
  assert.equal(provenanceLabel('written'), 'Written by the agent · passed checks');
  assert.equal(provenanceLabel('approved'), 'Approved example');
  assert.equal(provenanceLabel('other'), 'Source not recorded');
  assert.equal(explainReason('model.disabled'), 'Model switched off (templates only)');
  assert.equal(explainReason('unknown.code'), undefined);
});

test('eligible playbooks without approved pair wording show the availability instead of a match', () => {
  assert.deepEqual(consideredReasons({ eligible: true, hasApprovedWording: false, reasonCodes: ['eligibility.matched'] }), ['No approved wording for this pair']);
  assert.deepEqual(consideredReasons({ eligible: true, hasApprovedWording: false }), ['No approved wording for this pair']);
  assert.deepEqual(consideredReasons({ eligible: true, hasApprovedWording: true, reasonCodes: ['eligibility.matched'] }), ['Fits this page and journey']);
  assert.deepEqual(consideredReasons({ eligible: false, hasApprovedWording: null, reasonCodes: ['eligibility.facet'] }), ["Needs a preference the visitor hasn't chosen"]);
  assert.deepEqual(consideredReasons({ eligible: true, reasonCodes: ['eligibility.matched'] }), ['Fits this page and journey']);
});

test('decision details show a differing rules choice and only known rationale codes', () => {
  assert.deepEqual(decisionDetails({ baselinePlaybookId: 'destination-compare', selection: { playbookId: 'cost-focus' }, rationale: [
    'signal.price_focus', 'facet.explicit', 'signal.back_and_forth', 'signal.info_seeking', 'unknown', 'signal.price_focus',
  ] }), {
    rulesChoice: 'Rules would have chosen: Destination compare',
    reasons: [
      'because the visitor checked prices', 'because the visitor chose a preference',
      'because the visitor revisited options', 'because the visitor sought more information',
    ],
  });
  assert.deepEqual(decisionDetails({ baselinePlaybookId: 'destination-compare', selection: { playbookId: 'destination-compare' }, rationale: null }), { rulesChoice: undefined, reasons: [] });
  assert.equal(decisionDetails({ baselinePlaybookId: 'destination-compare', selection: { playbookId: null } }).rulesChoice, undefined);
});
