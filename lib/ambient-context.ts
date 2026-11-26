/**
 * Page context for Brand Concierge ambient context (controls.ambient_context).
 * Read when each Web SDK event is sent, including every conversation turn, so
 * it reflects the page the visitor is on at that moment. Contains only page
 * and catalog data, never visitor identity, typed input or query strings,
 * and is attached only while AAA consent is granted.
 */
import { redactPage, redactUrl } from './aaa-privacy.ts';
import { getDestination, getPackage } from './data.ts';

export const AMBIENT_XDM_NAMESPACE = '_adaptiveAssistance';
export const AMBIENT_SUMMARY_MAX_CHARS = 600;

export type AmbientPage = {
  url: string;
  path: string;
  title: string;
  heading?: string;
  summary?: string;
};

export type AmbientContextXdm = {
  [AMBIENT_XDM_NAMESPACE]: {
    pageContext: AmbientPage & { capturedAt: string; marker?: string };
  };
};

const clean = (value: string | null | undefined, max: number) => {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
};

export function ambientContextXdm(page: AmbientPage, now: Date, marker?: string): AmbientContextXdm {
  const pageContext = {
    url: redactUrl(page.url),
    path: page.path,
    title: clean(page.title, 200) ?? page.path,
    ...(clean(page.heading, 200) ? { heading: clean(page.heading, 200) } : {}),
    ...(clean(page.summary, AMBIENT_SUMMARY_MAX_CHARS) ? { summary: clean(page.summary, AMBIENT_SUMMARY_MAX_CHARS) } : {}),
    capturedAt: now.toISOString(),
    ...(clean(marker, 80) ? { marker: clean(marker, 80) } : {}),
  };
  return { [AMBIENT_XDM_NAMESPACE]: { pageContext } };
}

export function readAmbientPage(_doc: Document, location: Location): AmbientPage {
  const path = redactPage(location.pathname);
  const destination = path.startsWith('/destinations/') ? getDestination(path.slice('/destinations/'.length)) : undefined;
  const pack = path.startsWith('/packages/') ? getPackage(path.slice('/packages/'.length)) : undefined;
  return {
    url: redactUrl(location.href), path, title: 'Wanderly',
    ...(destination ? { heading: destination.name, summary: destination.description } : {}),
    ...(pack ? { heading: pack.packageName, summary: pack.summary } : {}),
  };
}

/** Web SDK onBeforeEventSend callback. Never cancels an event; adds nothing unless `allowed()` is true. */
export function createAmbientContextHook(read: () => AmbientPage, marker?: string, now = () => new Date(), allowed: () => boolean = () => true) {
  return (content: { xdm?: Record<string, unknown> }) => {
    try {
      if (!allowed()) return true;
      content.xdm = { ...(content.xdm ?? {}), ...ambientContextXdm(read(), now(), marker) };
    } catch (error) {
      console.error('Unable to attach page context for Brand Concierge:', error);
    }
    return true;
  };
}
