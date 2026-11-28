import { defaultNudgeSettings, validateNudgeSettings, type NudgeSettings } from '../aaa/nudge-settings.ts';

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const REFRESH_MS = 5_000;

export function createNudgeSettingsClient({ profileId, enabled, storage, fetchImpl = fetch, now = Date.now, changed = () => {} }: {
  profileId: string;
  enabled: () => boolean;
  storage?: SettingsStorage;
  fetchImpl?: typeof fetch;
  now?: () => number;
  changed?: () => void;
}) {
  const key = `aaa.nudge-settings.v1.${profileId}`;
  let settings = defaultNudgeSettings(profileId);
  let initialized = false;
  let nextRefresh = 0;
  let pending: Promise<void> | undefined;
  let epoch = 0;
  let warned = false;
  const update = (next: NudgeSettings) => {
    if (JSON.stringify(settings) !== JSON.stringify(next)) {
      settings = next;
      changed();
    }
  };
  const initialize = () => {
    if (!enabled() || initialized) return;
    initialized = true;
    try {
      const cached = storage?.getItem(key);
      if (cached) {
        const valid = validateNudgeSettings(JSON.parse(cached), profileId);
        if (valid) update(valid);
        else { console.warn('[aaa-settings] cache.invalid'); storage?.removeItem(key); }
      }
    } catch (error) {
      console.warn('[aaa-settings] cache.unavailable', error instanceof Error ? error.name : 'unknown');
    }
  };
  const refresh = async (force = false) => {
    if (!enabled()) return;
    initialize();
    if (pending) return pending;
    if (!force && now() < nextRefresh) return;
    nextRefresh = now() + REFRESH_MS;
    const requestEpoch = epoch;
    const request = (async () => {
      try {
        const response = await fetchImpl('/api/aaa/nudge-settings', {
          cache: 'no-store', signal: AbortSignal.timeout(3_000),
        });
        if (!response.ok) throw new Error('settings.unavailable');
        const valid = validateNudgeSettings(await response.json(), profileId);
        if (!valid) throw new Error('settings.invalid');
        if (!enabled() || requestEpoch !== epoch) return;
        warned = false;
        update(valid);
        try { storage?.setItem(key, JSON.stringify(valid)); }
        catch (error) { console.warn('[aaa-settings] cache.unavailable', error instanceof Error ? error.name : 'unknown'); }
      } catch (error) {
        if (!warned && enabled() && requestEpoch === epoch) {
          console.warn('[aaa-settings] refresh.failed', error instanceof Error ? error.message : 'unknown');
          warned = true;
        }
      }
    })();
    pending = request;
    try { await request; } finally { if (pending === request) pending = undefined; }
  };
  return {
    get: () => settings,
    initialize,
    refresh,
    reset() {
      epoch++;
      initialized = false;
      nextRefresh = 0;
      pending = undefined;
      warned = false;
      settings = defaultNudgeSettings(profileId);
      try { storage?.removeItem(key); }
      catch (error) { console.warn('[aaa-settings] cache.unavailable', error instanceof Error ? error.name : 'unknown'); }
    },
  };
}
