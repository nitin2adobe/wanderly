import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import profile from './profile.json' with { type: 'json' };
import catalog from './catalog.json' with { type: 'json' };
import evidence from './evidence.json' with { type: 'json' };
import offers from './offers.json' with { type: 'json' };
import approvals from './approvals.json' with { type: 'json' };
import { createProfileRegistry, DEMO_EXPOSURE_POLICY } from '../../aaa/profile/loader.ts';
import { createSignalCollector } from '../../aaa/collector.ts';
import { deriveJourney, matchMoment } from '../../aaa/journey.ts';
import { emptyExposure, evaluateSuppression } from '../../aaa/suppression.ts';
import { destinations, packages } from '../../lib/data.ts';
import { pageTypeForPath } from './aaa.ts';
import { faqDestinationId, packagePaceSelection } from './signals.ts';

test('deployment profile passes frozen schemas, references and D16 with helpful and commercial playbooks', () => {
  const result = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(profile);
  assert.ok(result.ok);
  assert.ok(result.active.profile.playbooks.some(playbook => playbook.kind === 'helpful'));
  assert.ok(result.active.profile.playbooks.some(playbook => playbook.kind === 'commercial'));
  assert.equal(result.active.profile.successEvent?.signalKind, 'transaction.step');
  assert.equal(result.active.profile.successEvent?.transactionPhase, 'complete');
  assert.deepEqual(result.active.profile.evidenceSet.entries, evidence.map(({ source, tenantId, sourcePath, ...entry }) => entry));
});
test('every exact demo template has an evidence-bound approval; commercial followup has a helpful primary', () => {
  for (const playbook of profile.playbooks) {
    for (const starter of playbook.starters) {
      const approval = approvals.find(item => item.templateId === starter.templateId && item.locale === 'en-US');
      assert.ok(approval);
      assert.equal(approval.tenantId, profile.tenantId);
      assert.equal(approval.textSha256, createHash('sha256').update(starter.text['en-US']).digest('hex'));
      assert.deepEqual(approval.evidenceIds, playbook.evidenceIds);
      assert.equal(approval.kind, starter.role === 'primary' ? 'helpful' : playbook.kind);
      if (approval.kind === 'commercial') {
        assert.ok(playbook.starters.some(item => item.role === 'primary'));
        assert.ok(offers.some(offer => offer.offerId === approval.offerId));
      }
    }
  }
});
test('demo catalog and offer claims match lib/data rather than invented discounts or live availability', () => {
  assert.deepEqual(catalog.filter(entry => entry.entityType === 'package').map(entry => entry.entityId).sort(), packages.map(pack => pack.id).sort());
  for (const entry of catalog) {
    assert.equal(entry.source, 'local-demo');
    assert.equal(entry.tenantId, profile.tenantId);
    if (entry.entityType === 'package') {
      const pack = packages.find(item => item.id === entry.entityId);
      assert.ok(pack);
      assert.equal(entry.name, pack.packageName);
      assert.equal(entry.destinationId, pack.slug);
      assert.equal(entry.nights, pack.nights);
      assert.equal(entry.pace, pack.pace);
      assert.equal(entry.samplePrice, pack.price);
      assert.equal(entry.summary, pack.summary);
    } else {
      const destination = destinations.find(item => item.slug === entry.entityId);
      assert.ok(destination);
      assert.equal(entry.tradeoff, destination.tradeoff);
      if ('practicalNotes' in entry) assert.deepEqual(entry.practicalNotes, destination.practicalNotes);
    }
  }
  const offer = offers[0];
  const pack = packages.find(item => item.id === offer.entityIds[0])!;
  assert.equal(offer.samplePrice, pack.price);
  assert.ok(pack.excluded.includes('International flights and travel insurance'));
  assert.match(offer.description, /Fictional demo content only; no discount, real availability or bookable offer/);
  assert.ok(evidence[0].summary['en-US'].includes(`${packages[0].nights} nights with ${packages[0].pace}`));
  assert.ok(evidence[0].summary['en-US'].includes(`${packages[1].nights} nights with ${packages[1].pace}`));
  for (const destination of destinations) {
    const item = evidence.find(entry => entry.evidenceId === `ev-destination-${destination.slug}`);
    assert.equal(item?.summary['en-US'], destination.tradeoff);
  }
});
test('host route mapping includes the transaction page but never treats it as completion', () => {
  assert.equal(pageTypeForPath('/booking'), 'booking');
  assert.equal(pageTypeForPath('/packages/island-rhythm'), 'package-detail');
  assert.equal(pageTypeForPath('/travel-info'), 'practical-info');
  assert.equal(pageTypeForPath('/unknown'), 'other');
  assert.ok(profile.signalMap.filter(mapping => mapping.kind === 'transaction.step').every(mapping => mapping.source === 'track'));
});

test('package pace signals activate only when reset is supported and retain selected values', () => {
  const published = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(profile);
  assert.ok(published.ok);
  const old = structuredClone(published.active.profile);
  const oldPace = old.facets.find(facet => facet.id === 'pace')!;
  oldPace.values = oldPace.values.filter(value => value.id !== 'any');
  assert.equal(packagePaceSelection('Relaxed', old), undefined);
  const next = structuredClone(old);
  next.facets.find(facet => facet.id === 'pace')!.values.push({ id: 'any' });
  let seq = 0;
  const page = { pageInstanceId: 'page', pageRevision: 1, pageType: 'package-list', sessionId: 'session', locale: 'en-US' };
  const collector = createSignalCollector({ profile: next, context: () => page, enabled: () => true, makeId: () => `signal-${++seq}` });
  for (const [label, expected] of [['Relaxed', 'relaxed'], ['Active', 'active'], ['All', 'any']] as const) {
    const selection = packagePaceSelection(label, next);
    assert.ok(selection);
    const signal = collector.track('facet.selected', selection);
    assert.equal(signal?.kind, 'facet.selected');
    assert.deepEqual(signal?.attributes, { facetId: 'pace', valueIds: [expected] });
  }
  assert.equal(packagePaceSelection('unexpected', next), undefined);
});

test('FAQ observations use a catalog destination rather than a composite FAQ id', () => {
  assert.equal(faqDestinationId('japan-entry'), 'japan');
  assert.equal(faqDestinationId('bali-luggage'), 'bali');
  assert.equal(faqDestinationId('japan-private-input'), undefined);
});

test('reviewed scenario rules match their page and visitor signal', () => {
  const published = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(profile);
  assert.ok(published.ok);
  const cases = [
    { pageType: 'comparison', event: 'entities.compared', payload: { entityIds: ['bali', 'switzerland'], entityType: 'destination' }, rule: 'compare-destinations' },
    { pageType: 'practical-info', event: 'info.sought', payload: { topicId: 'practical-planning' }, rule: 'travel-information' },
    { pageType: 'package-list', event: 'facet.selected', payload: { facetId: 'pace', valueIds: ['relaxed'] }, rule: 'filter-packages' },
    { pageType: 'package-detail', event: 'package.viewed', payload: { entityIds: ['island-rhythm'] }, rule: 'view-package' },
    { pageType: 'destination-detail', event: 'destination.viewed', payload: { entityIds: ['japan'] }, rule: 'view-destination' },
  ];
  const now = Date.parse('2026-11-26T10:00:00Z');
  for (const item of cases) {
    let id = 0;
    const page = { pageInstanceId: 'page', pageRevision: 1, pageType: item.pageType };
    const collector = createSignalCollector({
      profile: published.active.profile, context: () => ({ ...page, sessionId: 'session', locale: 'en-US' }),
      enabled: () => true, now: () => now, makeId: () => `signal-${++id}`,
    });
    assert.ok(collector.track(item.event, item.payload));
    const journey = deriveJourney(published.active.profile, collector.signals(), { now, page });
    assert.ok(journey);
    assert.equal(matchMoment(published.active.profile, journey)?.id, item.rule);
  }
});

test('guided rule over installed generic behaviors works without changing site mappings or transaction safety', () => {
  const exported = {
    ...profile,
    profileVersion: '1.2.1',
    momentRules: {
      ...profile.momentRules,
      rules: profile.momentRules.rules.filter(rule => rule.id === 'unresolved-exploration').map(rule => ({
        ...rule, when: { pageTypes: ['comparison'], signalKinds: ['entity.compared'] },
      })),
    },
  };
  const published = createProfileRegistry({ policy: DEMO_EXPOSURE_POLICY }).publish(exported);
  assert.ok(published.ok);
  assert.deepEqual(published.active.profile.signalMap, profile.signalMap);
  const page = { pageInstanceId: 'page-1', pageRevision: 1, pageType: 'comparison' };
  const now = Date.parse('2026-11-26T10:00:00Z');
  let id = 0;
  const collector = createSignalCollector({
    profile: published.active.profile,
    context: () => ({ ...page, sessionId: 'test-session', locale: 'en-US' }),
    enabled: () => true, now: () => now, makeId: () => `signal-${++id}`,
  });
  const journey = () => deriveJourney(published.active.profile, collector.signals(), { now, page })!;
  assert.equal(collector.track('page.viewed')?.kind, 'page.viewed');
  assert.equal(matchMoment(published.active.profile, journey()), undefined);
  assert.equal(collector.track('destination.viewed', { entityIds: ['bali'] })?.kind, 'entity.viewed');
  assert.equal(collector.track('entities.compared', { entityIds: ['bali', 'switzerland'], entityType: 'destination' })?.kind, 'entity.compared');
  assert.equal(collector.track('info.sought', { topicId: 'practical-planning' })?.kind, 'info.sought');
  assert.equal(collector.track('facet.selected', { facetId: 'priority', valueIds: ['budget'] })?.kind, 'facet.selected');
  assert.equal(matchMoment(published.active.profile, journey())?.id, 'unresolved-exploration');
  assert.equal(collector.track('booking.started', { flowId: 'flow-1' })?.kind, 'transaction.step');
  const suppression = evaluateSuppression({
    consent: 'granted', active: published.active, journey: journey(), exposure: emptyExposure(),
    chatActive: false, formFocused: false, now,
  });
  assert.ok(suppression.reasonCodes.includes('transaction.active'));
});
