import { connectAttributeSignals, connectDataLayer, type DataLayer } from '../../aaa/browser-inputs.ts';
import { createJourneyRuntime, type RuntimeDiagnostic } from '../../aaa/runtime.ts';
import type { SuppressionResult } from '../../aaa/suppression.ts';
import { getAaaRuntime } from '../../lib/aaa-runtime.ts';
import { getConsentAuthority } from '../../lib/aaa-consent.ts';
import { destinations, getDestination, getPackage } from '../../lib/data.ts';
import { SESSION_STORAGE_KEY, type WanderlyEvent } from '../../lib/events.ts';
import { redactPage } from '../../lib/aaa-privacy.ts';
import { createNudgeSettingsClient } from '../../lib/aaa-nudge-settings.ts';
import reviewedProfile from './profile.json' with { type: 'json' };
import { faqDestinationId, packagePaceSelection } from './signals.ts';

export const AAA_CHANGED = 'aaa:changed';
export const NUDGE_SETTINGS_CHANGED = 'aaa:nudge-settings-changed';
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
let runtime: ReturnType<typeof createJourneyRuntime> | undefined;
let settingsClient: ReturnType<typeof createNudgeSettingsClient> | undefined;
let flow: { sessionId: string; id: string } | undefined;
const diagnostic = (value: RuntimeDiagnostic) => console.warn('AAA diagnostic', value);

function getSettingsClient() {
  if (typeof window === 'undefined') return undefined;
  settingsClient ??= createNudgeSettingsClient({
    profileId: reviewedProfile.profileId,
    enabled: () => getAaaRuntime().get().enabled,
    storage: window.sessionStorage,
    changed: () => window.dispatchEvent(new Event(NUDGE_SETTINGS_CHANGED)),
  });
  return settingsClient;
}

export function getNudgeSettings() { return getSettingsClient()?.get(); }
export async function refreshNudgeSettings(force = false) { await getSettingsClient()?.refresh(force); }

function getRuntime() {
  if (typeof window === 'undefined') return undefined;
  runtime ??= createJourneyRuntime({
    availability: () => {
      const state = getAaaRuntime().get();
      return { consent: getConsentAuthority().get(), active: state.enabled ? state.active : undefined };
    },
    sessionId: () => window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined,
    storage: window.sessionStorage,
    settings: getNudgeSettings,
    changed: () => window.dispatchEvent(new Event(AAA_CHANGED)),
    diagnostic,
    // Only the explicit host confirmation mappings can emit a terminal phase through track.
    // The current local planner does not emit these confirmations.
    terminalConfirmed: signal => signal.source === 'track' && signal.kind === 'transaction.step' && !!signal.attributes.flowId,
  });
  return runtime;
}

export function pageTypeForPath(path: string): string {
  if (path === '/') return 'home';
  if (path === '/booking') return 'booking';
  if (path === '/destinations') return 'destination-list';
  if (path.startsWith('/destinations/')) return 'destination-detail';
  if (path === '/packages') return 'package-list';
  if (path.startsWith('/packages/')) return 'package-detail';
  if (path === '/compare') return 'comparison';
  if (path === '/travel-info') return 'practical-info';
  return 'other';
}

function navigate(page = `${window.location.pathname}${window.location.search}`) {
  const safe = redactPage(page);
  const packageId = new URLSearchParams(window.location.search).get('package');
  const selected = packageId ? getPackage(packageId) : undefined;
  const key = `${safe}${selected ? `|package:${selected.id}` : ''}`;
  getRuntime()?.setPage(pageTypeForPath(safe.split('?')[0]), key);
}
export const aaa = {
  track(name: string, payload?: Record<string, unknown>) {
    if (typeof window === 'undefined') return undefined;
    navigate();
    return getRuntime()?.track(name, payload);
  },
  revise() { getRuntime()?.revise(); },
};

export function trackPackagePace(value: string) {
  const state = getAaaRuntime().get();
  if (!state.enabled) return;
  const selection = packagePaceSelection(value, state.active.profile);
  if (selection) aaa.track('facet.selected', selection);
}

export function getCanonicalJourney() { if (typeof window !== 'undefined') navigate(); return getRuntime()?.getJourney(); }
export function getNudgeExposureCount() { return getRuntime()?.getExposureCount(); }
export function getCurrentPage() { if (typeof window !== 'undefined') navigate(); return getRuntime()?.getPage(); }
export function getCurrentMoment() { if (typeof window !== 'undefined') navigate(); return getRuntime()?.getMoment(); }
export function subscribeAaa(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AAA_CHANGED, listener);
  const unsubscribe = getAaaRuntime().subscribe(listener);
  return () => { window.removeEventListener(AAA_CHANGED, listener); unsubscribe(); };
}
function environment() {
  let focused = document.activeElement;
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
  return {
    chatActive: !!document.querySelector('button[aria-label="Close Wanderly chat"]'),
    formFocused: !!focused?.closest('input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"])'),
  };
}
export function evaluateCurrentSuppression(input: { chatActive?: boolean; formFocused?: boolean; now?: number; currentNudge?: boolean } = {}): SuppressionResult {
  const instance = getRuntime();
  if (instance) navigate();
  return instance ? instance.evaluate({ ...environment(), ...input })
    : { allowed: false, reasonCodes: ['journey.unavailable'] };
}
export function recordNudgeShown(): SuppressionResult {
  const instance = getRuntime();
  if (instance) navigate();
  return instance ? instance.shown(environment())
    : { allowed: false, reasonCodes: ['journey.unavailable'] };
}
export function recordNudgeDismissed() { getRuntime()?.dismiss(); }
export function clearCanonicalJourney() { getRuntime()?.clear(); flow = undefined; }

export function getComparisonSelection(): string[] | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const selected: unknown = JSON.parse(window.sessionStorage.getItem('wanderly-comparison') ?? '[]');
    return Array.isArray(selected) ? destinations.filter(destination => selected.includes(destination.slug)).map(destination => destination.slug) : undefined;
  } catch {
    diagnostic({ code: 'signal.invalid', source: 'track' });
    return undefined;
  }
}

export function startCanonicalInputs(): () => void {
  if (typeof window === 'undefined') return () => {};
  const settings = getSettingsClient();
  settings?.initialize();
  void settings?.refresh();
  const refreshOnReturn = () => {
    if (document.visibilityState === 'visible') void settings?.refresh();
  };
  window.addEventListener('focus', refreshOnReturn);
  document.addEventListener('visibilitychange', refreshOnReturn);
  const host = window as Window & { aaa?: typeof aaa; adobeDataLayer?: DataLayer };
  const previous = host.aaa;
  host.aaa = aaa;
  const collector = { ingest(source: Parameters<ReturnType<typeof createJourneyRuntime>['ingest']>[0], name: string, payload: unknown) {
    navigate();
    return getRuntime()?.ingest(source, name, isRecord(payload) ? payload : undefined);
  } };
  const attributes = connectAttributeSignals(document, collector);
  const layer = host.adobeDataLayer ??= [];
  const acdl = connectDataLayer(layer, collector, () => diagnostic({ code: 'signal.invalid', source: 'acdl' }));
  return () => {
    window.removeEventListener('focus', refreshOnReturn);
    document.removeEventListener('visibilitychange', refreshOnReturn);
    attributes(); acdl();
    if (!getAaaRuntime().get().enabled) settings?.reset();
    if (host.aaa === aaa) host.aaa = previous;
  };
}

function transactionFlow(sessionId: string) {
  if (flow?.sessionId === sessionId) return flow.id;
  const previous = getCanonicalJourney()?.raw.signals.filter(signal => signal.kind === 'transaction.step').at(-1);
  const id = previous?.kind === 'transaction.step' && !['complete', 'cancel'].includes(previous.attributes.phase)
    ? previous.attributes.flowId : undefined;
  flow = { sessionId, id: id ?? crypto.randomUUID() };
  return flow.id;
}

/** Compatibility ingress: existing UI events remain available to legacy demo inspectors. */
export function observeSiteEvent(event: WanderlyEvent) {
  if (!getRuntime()) return;
  navigate();
  const emit = getRuntime()!.track;
  const entityIds = event.entity ? [event.entity] : [];
  switch (event.eventType) {
    case 'DESTINATION_VIEW': if (event.entity && getDestination(event.entity)) emit('destination.viewed', { entityIds }); break;
    case 'PACKAGE_VIEW': if (event.entity && getPackage(event.entity)) emit('package.viewed', { entityIds }); break;
    case 'TRAVEL_INFO_VIEW': emit('info.sought', { entityIds, topicId: 'practical-planning' }); break;
    case 'FAQ_SEARCH': {
      const destination = faqDestinationId(event.entity);
      emit('info.sought', { entityIds: destination ? [destination] : [], topicId: 'practical-planning' });
      break;
    }
    case 'PRICE_VIEW': emit('info.sought', { entityIds, topicId: 'sample-price' }); break;
    case 'COMPARE_ADD':
    case 'COMPARE_VIEW':
    case 'COMPARE_REMOVE': {
      const ids = getComparisonSelection();
      if (!ids) { getRuntime()?.revise(); return; }
      if (ids.length >= 2) emit('entities.compared', { entityIds: ids, entityType: 'destination' });
      else getRuntime()?.revise();
      break;
    }
    case 'BOOKING_START':
    case 'BOOKING_STEP':
    case 'BOOKING_COMPLETE': emit(event.eventType === 'BOOKING_START' ? 'booking.started' : 'booking.step', { flowId: transactionFlow(event.sessionId) }); break;
    case 'ASSISTANCE_PREFERENCE': {
      const priority = event.metadata?.priority;
      if (typeof priority === 'string') emit('facet.selected', { facetId: 'priority', valueIds: [priority.toLowerCase().replaceAll('_', '-')] });
      break;
    }
    case 'ASSISTANCE_SHOWN': recordNudgeShown(); break;
    case 'ASSISTANCE_DISMISSED': if (!['withdrawn', 'unrestorable'].includes(String(event.metadata?.reason))) recordNudgeDismissed(); break;
  }
}
