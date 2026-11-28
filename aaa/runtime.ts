import { createSignalCollector, type SignalDiagnostic } from './collector.ts';
import type { CanonicalSignal, PageRef, SignalSource } from './contracts/types.ts';
import { validateContract } from './contracts/validate.ts';
import { deriveJourney, matchMoment } from './journey.ts';
import type { ActiveProfile } from './profile/loader.ts';
import { emptyExposure, evaluateSuppression, type ExposureState, type SuppressionResult } from './suppression.ts';
import type { NudgeSettings } from './nudge-settings.ts';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Availability = { consent: 'pending' | 'denied' | 'granted'; active?: ActiveProfile };
export type RuntimeDiagnostic = SignalDiagnostic | { code: 'journey.storage_unavailable' | 'journey.invalid_snapshot' };
const STORAGE_KEY = 'aaa.runtime.v1';

export function createJourneyRuntime(options: {
  availability: () => Availability;
  sessionId: () => string | undefined;
  storage?: StoragePort;
  now?: () => number;
  makeId?: () => string;
  changed?: () => void;
  diagnostic?: (diagnostic: RuntimeDiagnostic) => void;
  settings?: () => NudgeSettings | undefined;
  terminalConfirmed?: (signal: CanonicalSignal) => boolean;
}) {
  const now = options.now ?? Date.now;
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  let collector: ReturnType<typeof createSignalCollector> | undefined;
  let active: ActiveProfile | undefined;
  let sessionId: string | undefined;
  let page: PageRef | undefined;
  let pageKey: string | undefined;
  let exposure = emptyExposure();
  let currentNudge: { before: ExposureState; pageRevision: number } | undefined;
  let incomplete = false;
  let restored: CanonicalSignal[] = [];
  let lastDiagnostic: string | undefined;
  const diagnostic = (value: RuntimeDiagnostic) => {
    if (lastDiagnostic !== value.code) { lastDiagnostic = value.code; options.diagnostic?.(value); }
  };
  const changed = () => options.changed?.();
  const unsafeSnapshot = () => {
    incomplete = true;
    exposure = { count: 2, dismissed: true };
    diagnostic({ code: 'journey.invalid_snapshot' });
  };
  function readSnapshot() {
    if (!options.storage) return;
    let text: string | null;
    try { text = options.storage.getItem(STORAGE_KEY); }
    catch { unsafeSnapshot(); diagnostic({ code: 'journey.storage_unavailable' }); return; }
    if (!text) return;
    let value: unknown;
    try { value = JSON.parse(text); } catch { unsafeSnapshot(); return; }
    if (!value || typeof value !== 'object' || !('sessionId' in value)) { unsafeSnapshot(); return; }
    if (value.sessionId !== sessionId) return;
    if (!('exposure' in value) || !value.exposure || typeof value.exposure !== 'object') { unsafeSnapshot(); return; }
    const stored = value.exposure;
    if (!('count' in stored) || !Number.isSafeInteger(stored.count) || Number(stored.count) < 0
      || !('dismissed' in stored) || typeof stored.dismissed !== 'boolean'
      || ('lastShownAt' in stored && (typeof stored.lastShownAt !== 'number' || !Number.isFinite(stored.lastShownAt)))) { unsafeSnapshot(); return; }
    exposure = { count: Number(stored.count), dismissed: stored.dismissed, ...('lastShownAt' in stored ? { lastShownAt: Number(stored.lastShownAt) } : {}) };
    if (!('journey' in value) || value.journey === undefined || value.journey === null) return;
    const validated = validateContract('JourneyState', value.journey);
    if (!validated.valid || validated.value.sessionId !== sessionId) { unsafeSnapshot(); return; }
    const state = validated.value;
    const sameProfile = state.profileId === active?.profile.profileId && state.profileVersion === active?.profile.profileVersion;
    if (!sameProfile) { incomplete = state.derived.inProgress.status !== 'inactive'; return; }
    let seq = 0;
    if (state.raw.signals.length > 300 || state.raw.signals.some(signal => {
      const invalid = signal.seq <= seq || signal.sessionId !== sessionId || signal.profileId !== state.profileId || signal.profileVersion !== state.profileVersion;
      seq = signal.seq;
      return invalid;
    }) || seq !== state.lastSeq) { unsafeSnapshot(); return; }
    restored = state.raw.signals;
    // A snapshot is an observation, not authority to clear a transaction.
    incomplete = 'incomplete' in value && value.incomplete === true;
    page = { ...state.page, pageInstanceId: makeId(), pageRevision: state.page.pageRevision + 1 };
  }
  function getJourney() {
    if (!ensure() || !page || !active) return undefined;
    return deriveJourney(active.profile, collector!.signals(), {
      now: now(), page: { ...page }, terminalConfirmed: options.terminalConfirmed,
      incomplete: incomplete || collector!.incomplete(),
    });
  }
  function persist() {
    if (!options.storage) return;
    const journey = getJourney();
    try { options.storage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, exposure, journey, incomplete: incomplete || collector?.incomplete() })); }
    catch { diagnostic({ code: 'journey.storage_unavailable' }); }
  }
  function ensure(): boolean {
    const availability = options.availability();
    const sid = options.sessionId();
    if (availability.consent !== 'granted' || !availability.active || !sid) return false;
    if (sessionId !== sid) {
      collector = undefined; page = undefined; pageKey = undefined; restored = [];
      exposure = emptyExposure(); currentNudge = undefined; incomplete = false;
      sessionId = sid; active = availability.active;
      readSnapshot();
    }
    if (active !== availability.active) {
      const previous = active && page && collector ? deriveJourney(active.profile, collector.signals(), {
        now: now(), page, terminalConfirmed: options.terminalConfirmed,
      }) : undefined;
      incomplete ||= previous?.derived.inProgress.status !== undefined && previous.derived.inProgress.status !== 'inactive';
      collector = undefined; restored = []; currentNudge = undefined;
      active = availability.active;
      if (page) page.pageRevision++;
    }
    collector ??= createSignalCollector({
      profile: active.profile, initial: restored,
      enabled: () => options.availability().consent === 'granted' && options.availability().active === active,
      context: () => page && sessionId ? { ...page, sessionId, locale: active!.profile.locales.default } : undefined,
      now, makeId, diagnostic,
    });
    return true;
  }
  function setPage(pageType: string, key: string) {
    if (!ensure() || !active) return;
    if (pageKey === key && page?.pageType === pageType) return;
    pageKey = key;
    page = { pageInstanceId: makeId(), pageRevision: (page?.pageRevision ?? 0) + 1, pageType };
    currentNudge = undefined;
    const mapping = active.profile.signalMap.find(entry => entry.source === 'track' && entry.kind === 'page.viewed');
    if (mapping) collector!.track(mapping.match);
    persist(); changed();
  }
  function revise() {
    if (!ensure() || !page) return;
    page = { ...page, pageRevision: page.pageRevision + 1 };
    currentNudge = undefined;
    persist(); changed();
  }
  function ingest(source: SignalSource, name: string, payload?: Record<string, unknown>) {
    if (!ensure()) return undefined;
    const signal = collector!.ingest(source, name, payload);
    if (signal && page) {
      // The state changed even when the document and URL did not.
      page = { ...page, pageRevision: page.pageRevision + 1 };
      currentNudge = undefined;
    }
    if (signal || collector!.incomplete()) { persist(); changed(); }
    return signal;
  }
  function evaluate(input: { chatActive?: boolean; formFocused?: boolean; now?: number; currentNudge?: boolean } = {}): SuppressionResult {
    const availability = options.availability();
    const journey = getJourney();
    const effectiveExposure = input.currentNudge && currentNudge?.pageRevision === page?.pageRevision
      ? { ...currentNudge!.before, dismissed: exposure.dismissed } : exposure;
    return evaluateSuppression({
      ...availability, journey, exposure: effectiveExposure, now: input.now ?? now(),
      chatActive: input.chatActive ?? false, formFocused: input.formFocused ?? false,
      settings: options.settings?.(),
    });
  }
  return {
    setPage, revise, getJourney,
    getPage: () => ensure() && page ? { ...page } : undefined,
    getExposureCount: () => ensure() ? exposure.count : undefined,
    getMoment: () => { const journey = getJourney(); return journey && active ? matchMoment(active.profile, journey) : undefined; },
    ingest, track: (name: string, payload?: Record<string, unknown>) => ingest('track', name, payload),
    evaluate,
    shown(input?: Parameters<typeof evaluate>[0]): SuppressionResult {
      const result = evaluate({ ...input, currentNudge: false });
      if (result.allowed && page) {
        currentNudge = { before: { ...exposure }, pageRevision: page.pageRevision };
        exposure = { ...exposure, count: exposure.count + 1, lastShownAt: input?.now ?? now() };
        persist(); changed();
      }
      return result;
    },
    dismiss() {
      if (!ensure()) return;
      exposure = { ...exposure, dismissed: true }; currentNudge = undefined;
      persist(); changed();
    },
    clear() {
      collector = undefined; active = undefined; sessionId = undefined; page = undefined; pageKey = undefined;
      exposure = emptyExposure(); currentNudge = undefined; incomplete = false; restored = [];
      try { options.storage?.removeItem(STORAGE_KEY); }
      catch { diagnostic({ code: 'journey.storage_unavailable' }); }
      changed();
    },
  };
}
