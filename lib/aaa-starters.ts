import type { SiteProfile, StarterRequest, StarterResult } from '../aaa/contracts/types.ts';
import { validateContract } from '../aaa/contracts/validate.ts';
import { comparisonContext } from '../sites/wanderly/comparison.ts';
import { validateContextualStarters, type ContextualStarters } from './aaa-contextual-starters.ts';
import type { ContextualStarterResultV2 } from '../aaa/contracts/contextual/types.ts';

export type StarterTrace = {
  reasonCodes: string[];
  tools: string[];
  alternatives: string[];
  validatorVerdicts: string[];
  fallbackReasons: string[];
  suppressionReasons: string[];
};
export type StarterResponse = {
  result: StarterResult; trace: StarterTrace; traceId?: string;
  schemaVersion?: ContextualStarters['schemaVersion'];
  starterProvenance?: ContextualStarters['starterProvenance'];
  headline?: ContextualStarters['headline'];
  intentSummary?: string;
  visitorBrief?: ContextualStarterResultV2['visitorBrief'];
  why?: ContextualStarterResultV2['why'];
  rationale?: ContextualStarterResultV2['rationale'];
};

export function starterServiceTimeoutMs(value = process.env.NEXT_PUBLIC_AAA_DEMO_SERVICE_TIMEOUT_MS): number {
  if (!value) return 4000;
  const ms = Number(value);
  if (Number.isSafeInteger(ms) && ms >= 1000 && ms <= 30_000) return ms;
  console.warn('[aaa-starters] configuration.invalid_demo_timeout');
  return 4000;
}

const codes = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(item)))].slice(0, 30)
  : [];

/** Only bounded machine codes enter the inspector, never tool inputs, outputs, or page text. */
export function starterTrace(value: unknown): StarterTrace {
  const trace = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    reasonCodes: codes(trace.reasonCodes), tools: codes(trace.tools), alternatives: codes(trace.alternatives),
    validatorVerdicts: codes(trace.validatorVerdicts), fallbackReasons: codes(trace.fallbackReasons),
    suppressionReasons: codes(trace.suppressionReasons),
  };
}

export function staleStarterReason(result: StarterResult, request: StarterRequest, now = Date.now()): string | undefined {
  const { journey } = request;
  if (result.requestId !== request.requestId) return 'starter.request_changed';
  if (result.sessionId !== journey.sessionId) return 'starter.session_changed';
  if (result.profileId !== journey.profileId || result.profileVersion !== journey.profileVersion) return 'starter.profile_changed';
  if (result.pageInstanceId !== journey.page.pageInstanceId || result.pageRevision !== journey.page.pageRevision) return 'starter.page_changed';
  if (result.locale !== journey.locale) return 'starter.locale_changed';
  if (Date.parse(result.expiresAt) <= now) return 'starter.expired';
  if (Date.parse(result.generatedAt) > now || Date.parse(result.expiresAt) <= Date.parse(result.generatedAt)) return 'starter.invalid_lifetime';
}

function approvedTemplateStarters(playbook: SiteProfile['playbooks'][number] | undefined, locale: string): StarterResult['starters'] {
  const seen = new Set<string>();
  const starters: StarterResult['starters'] = [];
  const templates = [...playbook?.starters ?? []].sort((a, b) => Number(b.role === 'primary') - Number(a.role === 'primary'));
  for (const template of templates) {
    const text = template.text[locale]?.trim();
    if (!text || seen.has(text) || starters.length === 3 || (template.role === 'primary' && starters.some(item => item.role === 'primary'))) continue;
    seen.add(text);
    starters.push({ starterId: template.templateId, templateId: template.templateId, role: template.role, kind: 'helpful', text });
  }
  return starters.some(starter => starter.role === 'primary') ? starters : [];
}

/** Explicit profile templates only: no invented copy, offers, or padding to three pills. */
export function templateStarters(request: StarterRequest, profile: Readonly<SiteProfile>, reason: string, now = Date.now()): StarterResponse {
  const { journey } = request;
  const signals = journey.raw.signals.filter(signal => signal.pageInstanceId === journey.page.pageInstanceId);
  if (profile.profileId === 'wanderly' && journey.page.pageType === 'comparison') {
    const compared = signals.findLast(signal => signal.kind === 'entity.compared');
    const context = comparisonContext(journey, profile, compared?.entityIds ?? [], now);
    const rule = profile.momentRules.rules.find(item => item.id === request.momentRuleId && item.decision === 'ASSIST');
    const playbook = profile.playbooks.find(item => item.id === 'destination-compare' && item.kind === 'helpful' && rule?.playbookIds?.includes(item.id));
    const evidenceIds = context.entityIds.map(id => `ev-destination-${id}`);
    const starters = approvedTemplateStarters(playbook, journey.locale);
    const eligible = context.entityIds.length === 2 && context.evidence.length === 2
      && evidenceIds.every(id => playbook?.evidenceIds.includes(id)) && starters.length > 0;
    const result: StarterResult = {
      schemaVersion: '1.0.0', requestId: request.requestId, sessionId: journey.sessionId,
      profileId: journey.profileId, profileVersion: journey.profileVersion, locale: journey.locale,
      pageInstanceId: journey.page.pageInstanceId, pageRevision: journey.page.pageRevision,
      generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
      outcome: eligible ? 'fallback' : 'abstain', playbookId: eligible ? playbook?.id ?? null : null,
      starters: eligible ? starters : [],
      evidenceIds: eligible ? evidenceIds : [], offerIds: [],
      reasonCodes: [reason, eligible ? 'starter.template_fallback' : 'starter.no_eligible_template'],
    };
    return { result, trace: { ...starterTrace(undefined), reasonCodes: result.reasonCodes, fallbackReasons: [reason] } };
  }
  const entities = new Set(signals.flatMap(signal => signal.entityIds));
  const topics = new Set(signals.flatMap(signal => 'topicId' in signal.attributes ? [signal.attributes.topicId] : []));
  const rule = profile.momentRules.rules.find(item => item.id === request.momentRuleId && item.decision === 'ASSIST');
  const playbook = profile.playbooks.find(item => rule?.playbookIds?.includes(item.id)
    && item.kind === 'helpful'
    && item.starters.some(starter => starter.role === 'primary' && !!starter.text[journey.locale]?.trim())
    && (!item.eligibility.pageTypes?.length || item.eligibility.pageTypes.includes(journey.page.pageType))
    && (!item.eligibility.entityTypes?.length || signals.some(signal => 'entityType' in signal.attributes && item.eligibility.entityTypes!.includes(signal.attributes.entityType)))
    && (!item.eligibility.topicIds?.length || item.eligibility.topicIds.some(id => topics.has(id)))
    && (!item.eligibility.facetIds?.length || journey.facets.some(facet => item.eligibility.facetIds!.includes(facet.facetId)))
    && item.evidenceIds.every(id => profile.evidenceSet.entries.some(entry => entry.evidenceId === id
      && (!entry.validUntil || Date.parse(entry.validUntil) > now)
      && (!entry.entityIds?.length || entry.entityIds.every(entity => entities.has(entity)))
      && (!entry.topicIds?.length || entry.topicIds.some(topic => topics.has(topic))))));
  const starters = approvedTemplateStarters(playbook, journey.locale);
  const result: StarterResult = {
    schemaVersion: '1.0.0', requestId: request.requestId, sessionId: journey.sessionId,
    profileId: journey.profileId, profileVersion: journey.profileVersion, locale: journey.locale,
    pageInstanceId: journey.page.pageInstanceId, pageRevision: journey.page.pageRevision,
    generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
    outcome: starters.length ? 'fallback' : 'abstain', playbookId: starters.length ? playbook!.id : null,
    starters, evidenceIds: starters.length ? playbook!.evidenceIds : [], offerIds: [],
    reasonCodes: [reason, starters.length ? 'starter.template_fallback' : 'starter.no_eligible_template'],
  };
  return { result, trace: { ...starterTrace(undefined), reasonCodes: result.reasonCodes, fallbackReasons: [reason] } };
}

function profileResultReason(result: StarterResult, request: StarterRequest, profile: Readonly<SiteProfile>, now: number): string | undefined {
  if (result.outcome === 'abstain') return;
  const rule = profile.momentRules.rules.find(item => item.id === request.momentRuleId);
  if (!result.playbookId || !rule?.playbookIds?.includes(result.playbookId)) return 'starter.unapproved_playbook';
  if (result.evidenceIds.some(id => !profile.evidenceSet.entries.some(entry => entry.evidenceId === id && (!entry.validUntil || Date.parse(entry.validUntil) > now)))) return 'starter.invalid_evidence';
  if (result.offerIds.some(id => !profile.playbooks.some(playbook => playbook.offerIds?.includes(id)))) return 'starter.unapproved_offer';
}

export function serviceTrace(value: unknown): StarterTrace {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 'aaa-trace-1' || !('events' in value) || !Array.isArray(value.events)) {
    return { ...starterTrace(undefined), reasonCodes: ['trace.invalid'] };
  }
  const reasonCodes = codes(value.events.slice(0, 64).map(event => event && typeof event === 'object' && 'code' in event ? event.code : undefined));
  return {
    reasonCodes,
    tools: reasonCodes.filter(code => code.startsWith('tool.')),
    alternatives: reasonCodes.filter(code => code === 'playbook.considered'),
    validatorVerdicts: reasonCodes.filter(code => /^(validator|validation)\./.test(code)),
    fallbackReasons: reasonCodes.filter(code => /^(model\.(timeout|disabled)|provider\.unavailable|loop\.turn_limit)$/.test(code)),
    suppressionReasons: reasonCodes.filter(code => /^(transaction|eligibility)\./.test(code)),
  };
}

async function fetchServiceTrace(endpoint: string, traceId: string | undefined, origin: string | undefined, fetchImpl: typeof fetch): Promise<StarterTrace> {
  if (!traceId) return starterTrace(undefined);
  try {
    const response = await fetchImpl(new URL(`./traces/${traceId}`, endpoint), {
      headers: origin ? { Origin: origin } : {}, signal: AbortSignal.timeout(1000), cache: 'no-store',
    });
    if (!response.ok) throw new Error('trace.unavailable');
    return serviceTrace(await response.json());
  } catch (error) {
    console.warn('[aaa-starters] trace.unavailable', error instanceof Error ? error.name : 'unknown');
    return { ...starterTrace(undefined), reasonCodes: ['trace.unavailable'] };
  }
}

export async function generateStarters(request: StarterRequest, profile: Readonly<SiteProfile>, {
  fetchImpl = fetch, endpoint, origin, now = Date.now,
}: { fetchImpl?: typeof fetch; endpoint?: string; origin?: string; now?: () => number } = {}): Promise<StarterResponse> {
  if (!endpoint) return templateStarters(request, profile, 'service.unconfigured', now());
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(request),
      signal: AbortSignal.timeout(starterServiceTimeoutMs()), cache: 'no-store',
    });
    if (!response.ok) {
      console.warn('[aaa-starters] service.http_error', response.status);
      return templateStarters(request, profile, 'service.unavailable', now());
    }
    const body: unknown = await response.json();
    const envelope = body && typeof body === 'object' && 'result' in body ? body as { result: unknown; trace?: unknown } : { result: body, trace: undefined };
    const validated = validateContract('StarterResult', envelope.result);
    if (!validated.valid) return templateStarters(request, profile, 'service.invalid_result', now());
    const stale = staleStarterReason(validated.value, request, now()) ?? profileResultReason(validated.value, request, profile, now());
    if (stale) return templateStarters(request, profile, stale, now());
    const id = response.headers.get('X-AAA-Trace-Id');
    const traceId = id && /^[a-f0-9]{32}$/.test(id) ? id : undefined;
    const trace = traceId ? await fetchServiceTrace(endpoint, traceId, origin, fetchImpl) : starterTrace(envelope.trace);
    return { result: validated.value, trace, ...(traceId ? { traceId } : {}) };
  } catch (error) {
    console.warn('[aaa-starters] service.unavailable', error instanceof Error ? error.name : 'unknown');
    return templateStarters(request, profile, 'service.unavailable', now());
  }
}

export async function generateContextualStarters(request: StarterRequest, profile: Readonly<SiteProfile>, {
  fetchImpl = fetch, endpoint, origin, now = Date.now,
}: { fetchImpl?: typeof fetch; endpoint?: string; origin?: string; now?: () => number } = {}): Promise<StarterResponse> {
  if (!endpoint) return templateStarters(request, profile, 'service.unconfigured', now());
  try {
    const contextualEndpoint = new URL('./contextual-starters', endpoint);
    const response = await fetchImpl(contextualEndpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(request), signal: AbortSignal.timeout(starterServiceTimeoutMs()), cache: 'no-store',
    });
    if (!response.ok) throw new Error(`contextual.http_error.${response.status}`);
    const contextual = validateContextualStarters(await response.json());
    if (!contextual) throw new Error('contextual.invalid_result');
    const stale = staleStarterReason(contextual.result, request, now()) ?? profileResultReason(contextual.result, request, profile, now());
    if (stale) throw new Error(stale);
    const id = response.headers.get('X-AAA-Trace-Id');
    const traceId = id && /^[a-f0-9]{32}$/.test(id) ? id : undefined;
    const trace = traceId ? await fetchServiceTrace(endpoint, traceId, origin, fetchImpl) : starterTrace(undefined);
    return {
      schemaVersion: contextual.schemaVersion, result: contextual.result, starterProvenance: contextual.starterProvenance,
      ...(contextual.headline ? { headline: contextual.headline } : {}),
      ...(contextual.schemaVersion === 'aaa-contextual-starters-1' && contextual.intentSummary ? { intentSummary: contextual.intentSummary } : {}),
      ...(contextual.schemaVersion !== 'aaa-contextual-starters-1' && contextual.visitorBrief ? { visitorBrief: contextual.visitorBrief } : {}),
      ...(contextual.schemaVersion !== 'aaa-contextual-starters-1' && contextual.why ? { why: contextual.why } : {}),
      ...(contextual.schemaVersion !== 'aaa-contextual-starters-1' && contextual.rationale ? { rationale: contextual.rationale } : {}),
      trace, ...(traceId ? { traceId } : {}),
    };
  } catch (error) {
    console.warn('[aaa-starters] contextual.fallback', error instanceof Error ? error.message : 'unknown');
    return generateStarters(request, profile, { fetchImpl, endpoint, origin, now });
  }
}
