import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBIENT_SUMMARY_MAX_CHARS, createAmbientContextHook, readAmbientPage } from './ambient-context.ts';

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
