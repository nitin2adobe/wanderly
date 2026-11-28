import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBIENT_SUMMARY_MAX_CHARS, createAmbientContextHook, readAmbientPage } from './ambient-context.ts';
import { travelJourney, travelProfile } from '../sites/wanderly/contract-examples.ts';
import { createConciergeJourneyContextReader } from './concierge-context-packager.ts';
import { createIntentSummaryStore } from './aaa-intent-summary.ts';

const now = () => new Date('2026-11-25T00:00:00.000Z');

test('ambient hook reads the current page at send time and keeps existing XDM', () => {
  let path = '/destinations/japan';
  const hook = createAmbientContextHook(() => ({ url: `https://demo.test${path}`, path, title: 'Wanderly', heading: path.split('/').pop() }), 'MARK-1', now);
  const first: { xdm?: Record<string, unknown> } = { xdm: { identityMap: { ECID: [{ id: 'synthetic' }] } } };
  assert.equal(hook(first), true);
  path = '/destinations/portugal';
  const later: { xdm?: Record<string, unknown> } = {};
  hook(later);
  assert.deepEqual(first.xdm?.identityMap, { ECID: [{ id: 'synthetic' }] });
  assert.deepEqual(first.xdm?._adaptiveAssistance, { pageContext: { url: 'https://demo.test/destinations/japan', path: '/destinations/japan', title: 'Wanderly', heading: 'japan', capturedAt: '2026-11-25T00:00:00.000Z', marker: 'MARK-1' } });
  assert.equal((later.xdm?._adaptiveAssistance as { pageContext: { path: string } }).pageContext.path, '/destinations/portugal');
});

test('ambient snapshot uses approved catalog content, not dynamic page text or unknown paths', () => {
  const doc = { title: 'visitor@example.com', querySelector: () => { throw new Error('must not inspect DOM'); } } as unknown as Document;
  const page = readAmbientPage(doc, { href: 'https://demo.test/destinations/japan?email=visitor%40example.com', pathname: '/destinations/japan' } as Location);
  assert.equal(page.heading, 'Japan');
  assert.ok(!JSON.stringify(page).includes('visitor'));
  const unknown = readAmbientPage(doc, { href: 'https://demo.test/account/visitor@example.com', pathname: '/account/visitor@example.com' } as Location);
  assert.equal(unknown.path, '/');
  assert.equal(unknown.url, 'https://demo.test/');
});

test('ambient hook omits empty fields, caps the summary and never cancels the event', () => {
  const hook = createAmbientContextHook(() => ({ url: 'u', path: '/', title: '  ', heading: ' ', summary: 'x '.repeat(AMBIENT_SUMMARY_MAX_CHARS) }), undefined, now);
  const content: { xdm?: Record<string, unknown> } = {};
  hook(content);
  const pageContext = (content.xdm?._adaptiveAssistance as { pageContext: Record<string, string> }).pageContext;
  assert.equal(pageContext.title, '/');
  assert.equal('heading' in pageContext || 'marker' in pageContext, false);
  assert.equal(pageContext.summary.length, AMBIENT_SUMMARY_MAX_CHARS);
  const failing = createAmbientContextHook(() => { throw new Error('no document'); }, undefined, now);
  const original = console.error;
  console.error = () => {};
  try { assert.equal(failing(content), true); } finally { console.error = original; }
});

test('ambient hook serializes the mapped journey block into XDM and drops stale blocks', () => {
  const readJourneyContext = createConciergeJourneyContextReader({
    getProfile: () => travelProfile,
    getCanonicalJourney: () => travelJourney,
    getCurrentPage: () => travelJourney.page,
  });
  const hook = createAmbientContextHook(() => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }), undefined, now, () => true, readJourneyContext);
  const content: { xdm?: Record<string, unknown> } = { xdm: { customField: 'preserved' } };
  hook(content);
  assert.deepEqual(content.xdm?.customField, 'preserved');
  assert.deepEqual(content.xdm?._adaptiveAssistance, {
    pageContext: { url: 'https://demo.test/', path: '/', title: 'Wanderly', capturedAt: '2026-11-25T00:00:00.000Z' },
    journeyContext: { pageRevision: 2, fields: { pageType: 'package-detail', hesitating: 'active' } },
  });

  const noContext = createAmbientContextHook(
    () => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }),
    undefined, now, () => true, () => undefined,
  );
  const next: { xdm?: Record<string, unknown> } = { xdm: { _adaptiveAssistance: { journeyContext: { pageRevision: 1 } } } };
  noContext(next);
  assert.deepEqual(next.xdm?._adaptiveAssistance, {
    pageContext: { url: 'https://demo.test/', path: '/', title: 'Wanderly', capturedAt: '2026-11-25T00:00:00.000Z' },
  });
});

test('journey XDM is refreshed from the current revision on every Web SDK event', () => {
  let journey = travelJourney;
  const readJourneyContext = createConciergeJourneyContextReader({
    getProfile: () => travelProfile,
    getCanonicalJourney: () => journey,
    getCurrentPage: () => journey.page,
  });
  const hook = createAmbientContextHook(() => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }), undefined, now, () => true, readJourneyContext);
  const first: { xdm?: Record<string, unknown> } = {};
  hook(first);
  journey = {
    ...journey,
    page: { ...journey.page, pageRevision: journey.page.pageRevision + 1 },
  };
  const later: { xdm?: Record<string, unknown> } = {};
  hook(later);
  assert.equal((first.xdm?._adaptiveAssistance as { journeyContext: { pageRevision: number } }).journeyContext.pageRevision, 2);
  assert.equal((later.xdm?._adaptiveAssistance as { journeyContext: { pageRevision: number } }).journeyContext.pageRevision, 3);
});

test('a failed journey provider does not prevent page XDM from being attached', () => {
  const hook = createAmbientContextHook(
    () => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }),
    undefined, now, () => true,
    () => { throw new Error('journey unavailable'); },
  );
  const content: { xdm?: Record<string, unknown> } = {};
  const original = console.error;
  console.error = () => {};
  try { assert.equal(hook(content), true); } finally { console.error = original; }
  assert.equal((content.xdm?._adaptiveAssistance as { pageContext?: unknown }).pageContext !== undefined, true);
  assert.equal('journeyContext' in (content.xdm?._adaptiveAssistance as object), false);
});

test('outgoing XDM includes the activation summary only while consent and freshness hold', () => {
  const store = createIntentSummaryStore();
  let allowed = true;
  let fresh = true;
  store.set('Comparing trips', () => fresh);
  const readContext = createConciergeJourneyContextReader({
    getProfile: () => travelProfile, getCanonicalJourney: () => travelJourney,
    getCurrentPage: () => travelJourney.page, getIntentSummary: () => store.get(),
  });
  const hook = createAmbientContextHook(
    () => ({ url: 'https://demo.test/', path: '/', title: 'Wanderly' }), undefined, now, () => allowed, readContext,
  );
  const send = () => {
    const content: { xdm?: Record<string, unknown> } = {};
    hook(content);
    return content.xdm?._adaptiveAssistance as { journeyContext?: { fields: Record<string, string> } } | undefined;
  };
  assert.equal(send()?.journeyContext?.fields.intentSummary, 'Comparing trips');
  allowed = false;
  assert.equal(send(), undefined);
  allowed = true;
  fresh = false;
  assert.equal(send()?.journeyContext?.fields.intentSummary, undefined);
});
