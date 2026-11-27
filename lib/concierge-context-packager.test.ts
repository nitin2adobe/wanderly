import assert from 'node:assert/strict';
import test from 'node:test';
import { retailJourney, retailProfile } from '../sites/retail/contract-examples.ts';
import { travelJourney, travelProfile } from '../sites/wanderly/contract-examples.ts';
import deployedProfile from '../sites/wanderly/profile.json' with { type: 'json' };
import { validateContract } from '../aaa/contracts/validate.ts';
import { conciergeJourneyContextXdm } from './ambient-context.ts';
import {
  createConciergeJourneyContextReader,
  MAX_CONCIERGE_CONTEXT_FIELDS,
  MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS,
  MAX_CONCIERGE_CONTEXT_CODE_POINTS,
  MAX_CONCIERGE_CONTEXT_UTF8_BYTES,
  packageConciergeJourneyContext,
} from './concierge-context-packager.ts';

test('packages only contextMap fields and includes pageRevision', () => {
  assert.deepEqual(packageConciergeJourneyContext(travelProfile, travelJourney), {
    pageRevision: 2,
    fields: { pageType: 'package-detail', hesitating: 'active' },
  });
  const revisionMappedProfile = {
    ...travelProfile,
    contextMap: {
      maxChars: 600,
      fields: [
        { key: 'pageType', from: 'page.pageType' },
        { key: 'pageRevision', from: 'page.pageRevision' },
        { key: 'hesitation', from: 'derived.hesitation.status' },
        { key: 'inProgress', from: 'derived.inProgress.status' },
      ],
    },
  };
  assert.deepEqual(packageConciergeJourneyContext(revisionMappedProfile, travelJourney), {
    pageRevision: 2,
    fields: { pageType: 'package-detail', pageRevision: '2', hesitation: 'active', inProgress: 'inactive' },
  });
  assert.deepEqual(packageConciergeJourneyContext(retailProfile, retailJourney), {
    pageRevision: 0,
    fields: {
      pageType: 'product',
      priorities: '[{"facetId":"brand","valueIds":["volt","nordic"]},{"facetId":"priority","valueIds":["warranty"]}]',
    },
  });
});

test('does not export session IDs, raw signals, or unmapped derived details', () => {
  const context = packageConciergeJourneyContext(travelProfile, travelJourney);
  const rendered = JSON.stringify(context);
  assert.ok(!rendered.includes(travelJourney.sessionId));
  assert.ok(!rendered.includes('sig-'));
  assert.ok(!rendered.includes('basisSignalIds'));
  assert.ok(!rendered.includes('raw'));
});

test('suppresses the entire context instead of truncating a field or an over-budget block', () => {
  const tooLargeField = {
    ...retailJourney,
    facets: Array.from({ length: 20 }, (_, index) => ({
      ...retailJourney.facets[0],
      facetId: `facet-${index}`,
      valueIds: Array.from({ length: 5 }, (_, value) => `value-${value}`),
    })),
  };
  const facetsProfile = {
    ...retailProfile,
    contextMap: { maxChars: 2_048, fields: [{ key: 'facets', from: 'facets' }] },
  };
  const tooManyFields = {
    ...travelProfile,
    contextMap: {
      maxChars: 2_048,
      fields: Array.from({ length: MAX_CONCIERGE_CONTEXT_FIELDS + 1 }, (_, index) => ({ key: `f${index}`, from: 'page.pageType' })),
    },
  };
  const tooSmallAggregate = { ...travelProfile, contextMap: { ...travelProfile.contextMap, maxChars: 1 } };
  assert.equal(packageConciergeJourneyContext(facetsProfile, tooLargeField), undefined);
  assert.equal(packageConciergeJourneyContext(tooManyFields, travelJourney), undefined);
  assert.equal(packageConciergeJourneyContext(tooSmallAggregate, travelJourney), undefined);
});

test('enforces rendered code-point and UTF-8 budgets', () => {
  const context = packageConciergeJourneyContext(travelProfile, travelJourney);
  assert.ok(context);
  const rendered = JSON.stringify(conciergeJourneyContextXdm(context));
  assert.ok(Array.from(rendered).length <= MAX_CONCIERGE_CONTEXT_CODE_POINTS);
  assert.ok(new TextEncoder().encode(rendered).byteLength <= MAX_CONCIERGE_CONTEXT_UTF8_BYTES);
  assert.ok(MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS <= MAX_CONCIERGE_CONTEXT_CODE_POINTS);
});

test('suppresses missing and unsupported contextMap paths', () => {
  const unsupported = {
    ...travelProfile,
    contextMap: { maxChars: 600, fields: [{ key: 'since', from: 'derived.hesitation.since' }] },
  };
  const missing = {
    ...travelProfile,
    contextMap: { maxChars: 600, fields: [{ key: 'locale', from: 'locale' }] },
  };
  assert.equal(packageConciergeJourneyContext(unsupported, travelJourney), undefined);
  assert.equal(packageConciergeJourneyContext(missing, { ...travelJourney, locale: '' }), undefined);
});

test('reader takes one profile, journey and current-page snapshot and rejects stale revisions', () => {
  const calls = { profile: 0, journey: 0, page: 0 };
  const read = createConciergeJourneyContextReader({
    getProfile: () => { calls.profile++; return travelProfile; },
    getCanonicalJourney: () => { calls.journey++; return travelJourney; },
    getCurrentPage: () => { calls.page++; return travelJourney.page; },
  });

  assert.deepEqual(read(), { pageRevision: 2, fields: { pageType: 'package-detail', hesitating: 'active' } });
  assert.deepEqual(calls, { profile: 1, journey: 1, page: 1 });

  const stale = createConciergeJourneyContextReader({
    getProfile: () => travelProfile,
    getCanonicalJourney: () => travelJourney,
    getCurrentPage: () => ({ ...travelJourney.page, pageRevision: 3 }),
  });
  assert.equal(stale(), undefined);
});

test('includes a bounded visitor brief only when the complete XDM block fits', () => {
  const base = packageConciergeJourneyContext(travelProfile, travelJourney)!;
  const summary = 'Considering a beach trip';
  assert.deepEqual(packageConciergeJourneyContext(travelProfile, travelJourney, summary), {
    ...base, fields: { ...base.fields, visitorBrief: summary },
  });
  const tight = { ...travelProfile, contextMap: { ...travelProfile.contextMap, maxChars: Array.from(JSON.stringify(conciergeJourneyContextXdm(base))).length } };
  assert.deepEqual(packageConciergeJourneyContext(tight, travelJourney, summary), base);
  const full = { ...travelProfile, contextMap: { maxChars: 2_048, fields: Array.from({ length: 16 }, (_, i) => ({ key: `f${i}`, from: 'page.pageType' })) } };
  assert.equal(Object.keys(packageConciergeJourneyContext(full, travelJourney, summary)!.fields).length, 16);
  assert.deepEqual(packageConciergeJourneyContext(travelProfile, travelJourney, '😀'.repeat(401)), base);
  assert.deepEqual(packageConciergeJourneyContext(travelProfile, travelJourney, 'line\nbreak'), base);
  assert.deepEqual(packageConciergeJourneyContext(travelProfile, travelJourney, 'line\u0085break'), base);
  const deployed = validateContract('SiteProfile', deployedProfile);
  assert.ok(deployed.valid);
  assert.equal(packageConciergeJourneyContext(deployed.value, travelJourney, 'x'.repeat(400))?.fields.visitorBrief, 'x'.repeat(400));
  const unicode = packageConciergeJourneyContext({ ...travelProfile, contextMap: { ...travelProfile.contextMap, maxChars: 2_048 } }, travelJourney, '😀'.repeat(400))!;
  const rendered = JSON.stringify(conciergeJourneyContextXdm(unicode));
  assert.ok(Array.from(rendered).length <= MAX_CONCIERGE_CONTEXT_CODE_POINTS);
  assert.ok(new TextEncoder().encode(rendered).byteLength <= MAX_CONCIERGE_CONTEXT_UTF8_BYTES);
});
