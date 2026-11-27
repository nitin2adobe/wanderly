import type { JourneyState, PageRef, SiteProfile } from '../aaa/contracts/types.ts';

export const ADAPTIVE_ASSISTANCE_XDM_NAMESPACE = '_adaptiveAssistance';
export const MAX_CONCIERGE_CONTEXT_CODE_POINTS = 2_048;
export const MAX_CONCIERGE_CONTEXT_UTF8_BYTES = 8 * 1_024;
export const MAX_CONCIERGE_CONTEXT_FIELDS = 16;
export const MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS = 512;

export type ConciergeJourneyContext = {
  pageRevision: number;
  fields: Record<string, string>;
};

export type ConciergeJourneyContextSources = {
  getProfile: () => SiteProfile | undefined;
  getCanonicalJourney: () => JourneyState | undefined;
  getCurrentPage: () => PageRef | undefined;
  getVisitorBrief?: () => string | undefined;
};

const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const codePoints = (value: string) => Array.from(value).length;

function mappedValue(path: string, journey: JourneyState): string | undefined {
  if (path === 'locale') return safeId.test(journey.locale) ? journey.locale : undefined;
  if (path === 'page.pageType') return safeId.test(journey.page.pageType) ? journey.page.pageType : undefined;
  if (path === 'page.pageRevision') return Number.isSafeInteger(journey.page.pageRevision) && journey.page.pageRevision >= 0
    ? String(journey.page.pageRevision) : undefined;
  if (path === 'facets') {
    const facets = journey.facets.map(({ facetId, valueIds }) => {
      if (!safeId.test(facetId) || !valueIds.every(value => safeId.test(value))) return undefined;
      return { facetId, valueIds };
    });
    return facets.some(facet => !facet) ? undefined : JSON.stringify(facets);
  }
  const derivedStatus = /^derived\.(hesitation|inProgress)\.status$/.exec(path);
  if (derivedStatus) {
    const status = derivedStatus[1] === 'hesitation'
      ? journey.derived.hesitation.status : journey.derived.inProgress.status;
    return status === 'active' || status === 'inactive' || status === 'uncertain' ? status : undefined;
  }
  return undefined;
}

/**
 * Selects only explicitly mapped, non-raw JourneyState fields. If any configured
 * field is unsupported, missing, or over budget, the complete context is omitted.
 */
export function packageConciergeJourneyContext(profile: SiteProfile, journey: JourneyState, visitorBrief?: string): ConciergeJourneyContext | undefined {
  const { contextMap } = profile;
  if (!Number.isSafeInteger(journey.page.pageRevision) || journey.page.pageRevision < 0
    || !Number.isSafeInteger(contextMap.maxChars) || contextMap.maxChars < 1
    || !contextMap.fields.length || contextMap.fields.length > MAX_CONCIERGE_CONTEXT_FIELDS) return undefined;

  const fields: Record<string, string> = {};
  for (const field of contextMap.fields) {
    if (!safeId.test(field.key) || Object.hasOwn(fields, field.key)) return undefined;
    const value = mappedValue(field.from, journey);
    const limit = Math.min(field.maxChars ?? MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS, MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS);
    if (value === undefined || !Number.isSafeInteger(limit) || limit < 1 || codePoints(value) > limit) return undefined;
    fields[field.key] = value;
  }

  const totalCodePointLimit = Math.min(contextMap.maxChars, MAX_CONCIERGE_CONTEXT_CODE_POINTS);
  const fits = (value: ConciergeJourneyContext) => {
    const rendered = JSON.stringify({ [ADAPTIVE_ASSISTANCE_XDM_NAMESPACE]: { journeyContext: value } });
    return codePoints(rendered) <= totalCodePointLimit
      && new TextEncoder().encode(rendered).byteLength <= MAX_CONCIERGE_CONTEXT_UTF8_BYTES;
  };
  const context = { pageRevision: journey.page.pageRevision, fields };
  if (!fits(context)) return undefined;
  if (typeof visitorBrief === 'string' && visitorBrief.trim()
    && !/[\u0000-\u001f\u007f-\u009f]/.test(visitorBrief)
    && codePoints(visitorBrief) <= 400 && codePoints(visitorBrief) <= MAX_CONCIERGE_CONTEXT_FIELD_CODE_POINTS
    && Object.keys(fields).length < MAX_CONCIERGE_CONTEXT_FIELDS && !Object.hasOwn(fields, 'visitorBrief')) {
    const extended = { pageRevision: context.pageRevision, fields: { ...fields, visitorBrief } };
    if (fits(extended)) return extended;
  }
  return context;
}

/** Reads one current snapshot and rejects a journey that no longer matches the current page revision. */
export function createConciergeJourneyContextReader(sources: ConciergeJourneyContextSources) {
  return (): ConciergeJourneyContext | undefined => {
    const profile = sources.getProfile();
    const journey = sources.getCanonicalJourney();
    const page = sources.getCurrentPage();
    if (!profile || !journey || !page
      || journey.page.pageInstanceId !== page.pageInstanceId
      || journey.page.pageRevision !== page.pageRevision
      || journey.page.pageType !== page.pageType) return undefined;
    return packageConciergeJourneyContext(profile, journey, sources.getVisitorBrief?.());
  };
}
