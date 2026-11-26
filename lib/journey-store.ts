import { EVENT_STORAGE_KEY, SESSION_STORAGE_KEY, type WanderlyEvent, type WanderlyEventType } from './events.ts';
import { dropExpiredSessions, metadataAllowlist, minimizeEvent, SESSION_INACTIVITY_MS } from './aaa-privacy.ts';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MAX_EVENTS = 300;
const LAST_ACTIVE_KEY = `${SESSION_STORAGE_KEY}.lastActive`;

/**
 * Per-tab browser journey store. Everything lives in the tab's own storage
 * (sessionStorage in the browser). It stores only minimized events and forgets
 * the session after 30 minutes of inactivity. Before consent, the expiry sweep
 * may inspect session timestamps and delete expired data, but does not read or
 * rewrite journey events. `legacy` is the shared store used by earlier builds.
 */
export function createJourneyStore({ session, legacy, isGranted, now = () => Date.now(), notify = () => {}, makeId }: {
  session: KeyValueStore;
  legacy?: KeyValueStore;
  isGranted: () => boolean;
  now?: () => number;
  notify?: (event?: WanderlyEvent) => void;
  makeId: (prefix: string) => string;
}) {
  const removeLegacy = () => { try { legacy?.removeItem(EVENT_STORAGE_KEY); } catch {} };
  removeLegacy();

  const readAll = (): WanderlyEvent[] => {
    try {
      const parsed: unknown = JSON.parse(session.getItem(EVENT_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((event): event is WanderlyEvent =>
        !!event && typeof event === 'object' &&
        typeof event.id === 'string' && typeof event.sessionId === 'string' &&
        typeof event.timestamp === 'string' && typeof event.page === 'string' &&
        typeof event.eventType === 'string' && Object.hasOwn(metadataAllowlist, event.eventType)
      ).map(minimizeEvent);
    } catch { return []; }
  };
  const writeAll = (events: WanderlyEvent[]) => {
    if (events.length) session.setItem(EVENT_STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
    else session.removeItem(EVENT_STORAGE_KEY);
  };
  const forgetSession = () => {
    session.removeItem(SESSION_STORAGE_KEY);
    session.removeItem(LAST_ACTIVE_KEY);
  };
  const idle = () => {
    const lastActive = Number(session.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(lastActive) && lastActive > 0 && now() - lastActive >= SESSION_INACTIVITY_MS;
  };

  /**
   * Deletes an idle session and any expired events. Deletion needs no consent,
   * so it also runs while consent is pending or denied. Returns true if
   * anything was removed.
   */
  function sweep(): boolean {
    let changed = false;
    const sid = session.getItem(SESSION_STORAGE_KEY);
    if (!isGranted()) {
      if (!sid || !idle()) return false;
      session.removeItem(EVENT_STORAGE_KEY);
      forgetSession();
      notify();
      return true;
    }
    if (sid && idle()) { forgetSession(); changed = true; }
    const all = readAll();
    const kept = dropExpiredSessions(all, now()).filter(event => !changed || event.sessionId !== sid);
    if (kept.length !== all.length) changed = true;
    writeAll(kept);
    if (changed) notify();
    return changed;
  }

  function getEvents(): WanderlyEvent[] {
    if (!isGranted()) return [];
    const kept = dropExpiredSessions(readAll(), now());
    writeAll(kept);
    return kept;
  }

  function getSessionId(): string {
    if (!isGranted()) return '';
    let sid = session.getItem(SESSION_STORAGE_KEY);
    // A session idle past the inactivity window is forgotten; continuing starts a new one.
    if (sid && idle()) {
      writeAll(readAll().filter(event => event.sessionId !== sid));
      sid = null;
    }
    if (!sid) {
      sid = makeId('w');
      session.setItem(SESSION_STORAGE_KEY, sid);
      session.setItem(LAST_ACTIVE_KEY, String(now()));
    }
    return sid;
  }

  /** The inspector's view: only this tab's current session, and nothing without consent. */
  function currentJourney(): { sessionId: string; events: WanderlyEvent[] } {
    const sessionId = getSessionId();
    return { sessionId, events: sessionId ? getEvents().filter(event => event.sessionId === sessionId) : [] };
  }

  function track(eventType: WanderlyEventType, page: string, entity?: string, metadata?: Record<string, unknown>) {
    if (!isGranted()) return undefined;
    const sessionId = getSessionId();
    const event = minimizeEvent({ id: makeId('e'), sessionId, timestamp: new Date(now()).toISOString(), eventType, page, entity, metadata });
    writeAll([...getEvents(), event]);
    session.setItem(LAST_ACTIVE_KEY, String(now()));
    notify(event);
    return event;
  }

  function clearSession(targetSid?: string) {
    const sid = targetSid || session.getItem(SESSION_STORAGE_KEY);
    if (sid) writeAll(readAll().filter(event => event.sessionId !== sid));
    if (!targetSid || session.getItem(SESSION_STORAGE_KEY) === sid) forgetSession();
    notify();
  }

  /** Removes all AAA journey history held by this tab (and any legacy shared copy). */
  function purge() {
    session.removeItem(EVENT_STORAGE_KEY);
    forgetSession();
    removeLegacy();
    notify();
  }

  return { getEvents, getSessionId, currentJourney, track, clearSession, purge, sweep };
}
