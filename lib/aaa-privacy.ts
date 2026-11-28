/**
 * Data minimization for AAA journey data. Every stored event passes through
 * an allowlist: each event type accepts only the metadata keys listed for it,
 * and each key has a typed rule. Anything else (form contents, free text,
 * raw query strings, account identifiers, sensitive preferences) is dropped.
 */
import type { WanderlyEvent, WanderlyEventType } from './events.ts';
import { assistanceTypes } from './assistance-schema.ts';
import { conciergePriorities, validateHandoff } from './concierge-handoff.ts';
import { destinations, getDestination, getPackage, packages } from './data.ts';
import { electronicsCatalog } from './brand-config.ts';
import { travelFaqs } from './travel-info.ts';

export const SESSION_INACTIVITY_MS = 30 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID = /^w_[a-z0-9]+_[a-z0-9]+$/;
const entities = new Set([
  ...destinations.flatMap(d => [d.slug, ...d.stayStyles.map(s => s.name), ...travelFaqs(d).map(f => `${d.slug}-${f.id}`)]),
  ...packages.map(p => p.id),
  ...electronicsCatalog.map(p => p.name.toLowerCase().replaceAll(' ', '-')),
]);
const handoffEntities = new Set([
  ...destinations.map(d => d.name),
  ...packages.flatMap(p => [p.name, p.packageName]),
  ...electronicsCatalog.map(p => p.name),
]);
const routes = new Set(['/', '/agent', '/booking', '/compare', '/concierge-knowledge', '/demo', '/demo/live', '/demo/electronics', '/destinations', '/packages', '/travel-info']);

type Rule = (value: unknown) => unknown;
const DROP = undefined;

const id: Rule = value => typeof value === 'string' && UUID.test(value) ? value : DROP;
const oneOf = (...values: readonly string[]): Rule => value => typeof value === 'string' && values.includes(value) ? value : DROP;
const bool: Rule = value => typeof value === 'boolean' ? value : DROP;
const count: Rule = value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : DROP;
const duration: Rule = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 3_600_000 ? Math.round(value) : DROP;

const metadataRules = {
  assistanceType: oneOf(...assistanceTypes, 'UNKNOWN'),
  activationId: id,
  source: oneOf('rules', 'rules-fallback', 'ai-live', 'ai-mock', 'unknown', 'automatic', 'visitor-retry'),
  delivery: oneOf('opened', 'submitted', 'existing', 'cancelled'),
  reason: oneOf('obsolete-or-closed', 'acknowledgement-failed', 'withdrawn', 'interrupted-request', 'unrestorable', 'visitor', 'sdk-error'),
  phase: oneOf('opening', 'service'),
  activationMode: oneOf('rules', 'ai'),
  priority: oneOf(...conciergePriorities),
  conversationId: id,
  interactionId: id,
  questionKind: oneOf('suggested', 'visitor'),
  queryNumber: count,
  correlatedQuery: bool,
  responseMs: duration,
  feedback: oneOf('positive', 'negative'),
  handoff: value => {
    const result = validateHandoff(value);
    if (!result.valid) return DROP;
    const h = result.value;
    if (!['wanderly', 'electronics-demo'].includes(h.brand) || !SESSION_ID.test(h.sessionId)) return DROP;
    return {
      version: 1, brand: h.brand, intent: h.intent,
      entities: h.entities.filter(entity => handoffEntities.has(entity)),
      observedSignals: [],
      explicitPreferences: h.explicitPreferences.priority ? { priority: h.explicitPreferences.priority } : {},
      entryPoint: h.entryPoint, sessionId: h.sessionId, createdAt: h.createdAt,
    };
  },
} satisfies Record<string, Rule>;

type MetadataKey = keyof typeof metadataRules;

const lifecycle: MetadataKey[] = ['assistanceType', 'activationId', 'handoff', 'source', 'reason'];
const conversation: MetadataKey[] = ['activationId', 'assistanceType', 'conversationId', 'interactionId'];

/** Allowed metadata keys per event type. Browsing events carry no metadata at all. */
export const metadataAllowlist: Record<WanderlyEventType, readonly MetadataKey[]> = {
  SESSION_START: [], PAGE_VIEW: [], DESTINATION_VIEW: [], HOTEL_VIEW: [], PACKAGE_VIEW: [],
  COMPARE_ADD: [], COMPARE_VIEW: [], COMPARE_REMOVE: [], DATE_SEARCH: [], PRICE_VIEW: [],
  TRAVEL_INFO_VIEW: [], FAQ_SEARCH: [], BOOKING_START: [], BOOKING_STEP: [], BOOKING_COMPLETE: [],
  ASSISTANCE_EVALUATED: ['source', 'activationMode'],
  ASSISTANCE_REQUESTED: lifecycle,
  ASSISTANCE_SHOWN: lifecycle,
  ASSISTANCE_OPENED: [...lifecycle, 'delivery'],
  ASSISTANCE_TRIGGERED: lifecycle,
  ASSISTANCE_ACCEPTED: lifecycle,
  ASSISTANCE_CANCELLED: lifecycle,
  ASSISTANCE_DISMISSED: ['assistanceType', 'activationId', 'reason'],
  ASSISTANCE_PREFERENCE: ['assistanceType', 'activationId', 'priority'],
  ASSISTANCE_FAILED: [...conversation, 'phase', 'reason'],
  ASSISTANCE_QUERY_SUBMITTED: [...conversation, 'questionKind', 'queryNumber'],
  ASSISTANCE_RESPONSE_STARTED: [...conversation, 'correlatedQuery'],
  ASSISTANCE_RESPONSE_COMPLETED: [...conversation, 'correlatedQuery', 'responseMs'],
  ASSISTANCE_FEEDBACK: [...conversation, 'feedback'],
};

export function redactMetadata(eventType: WanderlyEventType, metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const allowed = metadataAllowlist[eventType] ?? [];
  if (!metadata || !allowed.length) return undefined;
  const kept: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!Object.hasOwn(metadata, key)) continue;
    const value = metadataRules[key](metadata[key]);
    if (value !== DROP) kept[key] = value;
  }
  return Object.keys(kept).length ? kept : undefined;
}

/** Only known routes and a validated catalog destination survive. */
export function redactPage(page: string): string {
  let url: URL;
  try { url = new URL(page, 'https://aaa.invalid'); } catch { return '/'; }
  const path = url.pathname;
  const dynamicDestination = path.startsWith('/destinations/') && getDestination(path.slice('/destinations/'.length));
  const dynamicPackage = path.startsWith('/packages/') && getPackage(path.slice('/packages/'.length));
  if (!routes.has(path) && !dynamicDestination && !dynamicPackage) return '/';
  const destination = url.searchParams.get('destination');
  return `${path}${destination && getDestination(destination) ? `?destination=${encodeURIComponent(destination)}` : ''}`;
}

/** Absolute URL without query string, fragment or credentials. */
export function redactUrl(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${redactPage(url.pathname)}`;
  } catch { return ''; }
}

export const redactEntity = (entity: string | undefined) => entity !== undefined && entities.has(entity) ? entity : undefined;

export function minimizeEvent(event: WanderlyEvent): WanderlyEvent {
  const entity = redactEntity(event.entity);
  const metadata = redactMetadata(event.eventType, event.metadata);
  if (metadata?.handoff && (metadata.handoff as { sessionId: string }).sessionId !== event.sessionId) delete metadata.handoff;
  return {
    id: event.id, sessionId: event.sessionId, timestamp: event.timestamp, eventType: event.eventType, page: redactPage(event.page),
    ...(entity ? { entity } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/** Drops every session whose most recent event is older than the inactivity window. */
export function dropExpiredSessions(events: WanderlyEvent[], now: number, inactivityMs = SESSION_INACTIVITY_MS): WanderlyEvent[] {
  const lastActivity = new Map<string, number>();
  for (const event of events) {
    const at = Date.parse(event.timestamp);
    if (Number.isFinite(at)) lastActivity.set(event.sessionId, Math.max(lastActivity.get(event.sessionId) ?? 0, at));
  }
  return events.filter(event => now - (lastActivity.get(event.sessionId) ?? 0) < inactivityMs);
}
