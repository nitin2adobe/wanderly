/**
 * Page context for Brand Concierge ambient context (controls.ambient_context).
 * Read when each Web SDK event is sent, including every conversation turn, so
 * it reflects the page the visitor is on at that moment. Contains only page
 * and catalog data, never visitor identity, typed input or query strings,
 * and is attached only while AAA consent is granted.
 */
import { redactPage, redactUrl } from './aaa-privacy.ts';
import { getDestination, getPackage } from './data.ts';
import { ADAPTIVE_ASSISTANCE_XDM_NAMESPACE, type ConciergeJourneyContext } from './concierge-context-packager.ts';

export const AMBIENT_XDM_NAMESPACE = ADAPTIVE_ASSISTANCE_XDM_NAMESPACE;
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

export function conciergeJourneyContextXdm(context: ConciergeJourneyContext) {
  return { [AMBIENT_XDM_NAMESPACE]: { journeyContext: context } };
}

export function readAmbientPage(_doc: Document, location: Location, comparisonSummary?: string): AmbientPage {
  const path = redactPage(location.pathname);
  const destination = path.startsWith('/destinations/') ? getDestination(path.slice('/destinations/'.length)) : undefined;
  const pack = path.startsWith('/packages/') ? getPackage(path.slice('/packages/'.length)) : undefined;
  return {
    url: redactUrl(location.href), path, title: 'Wanderly',
    ...(destination ? { heading: destination.name, summary: destination.description } : {}),
    ...(pack ? { heading: pack.packageName, summary: pack.summary } : {}),
    ...(path === '/compare' && comparisonSummary ? { summary: comparisonSummary } : {}),
  };
}

/** Web SDK onBeforeEventSend callback. Never cancels an event; adds nothing unless `allowed()` is true. */
export function createAmbientContextHook(
  read: () => AmbientPage,
  marker?: string,
  now = () => new Date(),
  allowed: () => boolean = () => true,
  readJourneyContext?: () => ConciergeJourneyContext | undefined,
) {
  return (content: { xdm?: Record<string, unknown> }) => {
    try {
      if (!allowed()) return true;
      const pageXdm = ambientContextXdm(read(), now(), marker);
      const existing = content.xdm?.[AMBIENT_XDM_NAMESPACE];
      const existingContext = typeof existing === 'object' && existing !== null && !Array.isArray(existing)
        ? existing as Record<string, unknown> : {};
      let journeyContext: ConciergeJourneyContext | undefined;
      try { journeyContext = readJourneyContext?.(); }
      catch (error) { console.error('Unable to package journey context for Brand Concierge:', error); }
      const journeyXdm = journeyContext ? conciergeJourneyContextXdm(journeyContext)[AMBIENT_XDM_NAMESPACE] : {};
      const adaptiveAssistance: Record<string, unknown> = {
        ...existingContext,
        ...pageXdm[AMBIENT_XDM_NAMESPACE],
        ...journeyXdm,
      };
      if (readJourneyContext && !journeyContext) delete adaptiveAssistance.journeyContext;
      content.xdm = { ...(content.xdm ?? {}), [AMBIENT_XDM_NAMESPACE]: adaptiveAssistance };
    } catch (error) {
      console.error('Unable to attach page context for Brand Concierge:', error);
    }
    return true;
  };
}
