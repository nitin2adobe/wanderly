import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignalCollector } from '../../aaa/collector.ts';
import { deriveJourney } from '../../aaa/journey.ts';
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '../../aaa/profile/loader.ts';
import { validateContract } from '../../aaa/contracts/validate.ts';
import { templateStarters } from '../../lib/aaa-starters.ts';
import { createActivationController, type ActivationProvider } from '../../lib/aaa-activation.ts';
import { createAmbientContextHook, readAmbientPage } from '../../lib/ambient-context.ts';
import profileJson from './profile.json' with { type: 'json' };
import { comparisonContext, comparisonSummary, validateComparisonStarter } from './comparison.ts';

test('comparison context carries the current Bali–Switzerland pair and only available scoped evidence', async () => {
  const active = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(profileJson);
  assert.ok(active.ok);
  const profile = structuredClone(active.active.profile);
  const page = { pageInstanceId: 'page', pageRevision: 3, pageType: 'comparison' };
  let id = 0;
  const collector = createSignalCollector({ profile, context: () => ({ ...page, pageRevision: 2, sessionId: 's', locale: 'en-US' }), enabled: () => true, makeId: () => `s-${++id}` });
  collector.track('entities.compared', { entityIds: ['bali', 'switzerland'], entityType: 'destination' });
  const journey = deriveJourney(profile, collector.signals(), { now: Date.now(), page })!;
  const comparison = comparisonContext(journey, profile, ['bali', 'switzerland']);
  assert.deepEqual(comparison.entityIds, ['bali', 'switzerland']);
  assert.deepEqual(comparison.evidence.map(item => item.entityId), ['bali', 'switzerland']);
  assert.doesNotMatch(JSON.stringify(comparison), /japan|s-1/i);
  const request = { schemaVersion: '1.0.0' as const, requestId: 'request', requestedAt: new Date().toISOString(), momentRuleId: 'unresolved-exploration', journey };
  assert.equal(validateContract('StarterRequest', request).valid, true);
  const fallback = templateStarters(request, profile, 'service.unavailable');
  assert.deepEqual(fallback.result.evidenceIds, ['ev-destination-bali', 'ev-destination-switzerland']);
  const result = validateComparisonStarter(fallback.result, comparison);
  assert.equal(result?.starters[0].text, fallback.result.starters[0].text);
  const playbook = profile.playbooks.find(item => item.id === 'destination-compare')!;
  playbook.starters = playbook.starters.filter(starter => starter.role === 'primary');
  playbook.starters.push(
    { templateId: 'followup-1', role: 'followup', text: { 'en-US': 'What are the main trade-offs?' } },
    { templateId: 'followup-2', role: 'followup', text: { 'en-US': 'How do the trip styles differ?' } },
  );
  const multiFallback = templateStarters(request, profile, 'service.unavailable');
  assert.deepEqual(multiFallback.result.starters.map(starter => starter.templateId), ['t-destination-compare', 'followup-1', 'followup-2']);
  assert.deepEqual(multiFallback.result.evidenceIds, fallback.result.evidenceIds);
  assert.equal(validateContract('StarterResult', multiFallback.result).valid, true);
  const generated = { ...fallback.result, starters: [{ ...fallback.result.starters[0], text: 'Which of Bali and Switzerland better suits a slow trip?' }] };
  assert.deepEqual(validateComparisonStarter(generated, comparison), generated);
  assert.equal(validateComparisonStarter({ ...fallback.result, evidenceIds: ['ev-destination-bali', 'ev-destination-japan'] }, comparison), undefined);
  const focusedEvidence = ['bali', 'switzerland'].map(id => ({
    ...profile.evidenceSet.entries.find(entry => entry.evidenceId === `ev-destination-${id}`)!,
    evidenceId: `ev-cost-${id}`,
  }));
  profile.evidenceSet.entries.push(...focusedEvidence);
  profile.playbooks.push({ ...playbook, id: 'cost-focus', evidenceIds: focusedEvidence.map(entry => entry.evidenceId) });
  const focusedContext = comparisonContext(journey, profile, ['bali', 'switzerland']);
  const focused = { ...fallback.result, playbookId: 'cost-focus', evidenceIds: ['ev-cost-bali', 'ev-cost-switzerland'] };
  assert.deepEqual(validateComparisonStarter(focused, focusedContext), focused);
  assert.equal(validateComparisonStarter({ ...focused, evidenceIds: ['ev-cost-bali', 'ev-destination-switzerland'] }, focusedContext), undefined);
  assert.equal(validateComparisonStarter({ ...focused, evidenceIds: ['ev-cost-bali', 'ev-cost-bali'] }, focusedContext), undefined);
  const provider: ActivationProvider = {
    read: () => ({ journey, profile, momentRuleId: 'unresolved-exploration', allowed: true, reasonCodes: [] }),
    recordShown: () => ({ allowed: true, reasonCodes: [] }), recordDismissed() {},
  };
  const prepared = await createActivationController(provider, async (_url, init) => {
    const sent = JSON.parse(String(init?.body)) as typeof request;
    assert.deepEqual(sent.journey.raw.signals.at(-1)?.entityIds, ['bali', 'switzerland']);
    return Response.json(templateStarters(sent, profile, 'service.unavailable'));
  }).prepare();
  assert.ok(prepared);
  assert.deepEqual(prepared.response.result.evidenceIds, ['ev-destination-bali', 'ev-destination-switzerland']);
  const summary = comparisonSummary(comparison);
  assert.match(summary ?? '', /Bali \(bali\).*Switzerland \(switzerland\)/);
  const location = { pathname: '/compare', href: 'https://example.test/compare' } as Location;
  const content: { xdm?: Record<string, unknown> } = {};
  const hook = createAmbientContextHook(() => readAmbientPage({} as Document, location, summary), undefined, undefined, () => true);
  hook(content);
  assert.match(JSON.stringify(content), /Demo-approved comparison facts/);
  assert.doesNotMatch(JSON.stringify(content), /japan/i);
  const denied: typeof content = {};
  createAmbientContextHook(() => readAmbientPage({} as Document, location, summary), undefined, undefined, () => false)(denied);
  assert.equal(denied.xdm, undefined);
  assert.deepEqual(comparisonContext(journey, profile, ['bali']).entityIds, []);
  assert.deepEqual(comparisonContext(journey, profile, ['bali', 'japan', 'switzerland']).entityIds, []);
  assert.deepEqual(comparisonContext(journey, profile, ['bali', 'japan']).entityIds, []);
  assert.deepEqual(comparisonContext(journey, profile, ['bali', 'unknown']).entityIds, []);
  profile.evidenceSet.entries = profile.evidenceSet.entries.filter(entry => entry.evidenceId !== 'ev-destination-switzerland');
  assert.deepEqual(comparisonContext(journey, profile, ['bali', 'switzerland']).evidence.map(item => item.entityId), ['bali']);
  assert.equal(templateStarters(request, profile, 'service.unavailable').result.outcome, 'abstain');
});
