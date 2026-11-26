'use client';
import { EVENT_UPDATED, WanderlyEvent, WanderlyEventType } from './events';
import { isConsentGranted } from './aaa-consent';
import { gateJourneyStore, isAaaEnabled } from './aaa-runtime';
import { createJourneyStore } from './journey-store';

function id(prefix:string){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`}
let store: ReturnType<typeof createJourneyStore> | undefined;
function journey(){
  if(typeof window==='undefined') return undefined;
  store ??= gateJourneyStore(createJourneyStore({
    session: window.sessionStorage,
    legacy: window.localStorage,
    isGranted: isConsentGranted,
    makeId: id,
    notify: event => window.dispatchEvent(event ? new CustomEvent(EVENT_UPDATED,{detail:event}) : new Event(EVENT_UPDATED)),
  }), isAaaEnabled);
  return store;
}
export function getSessionId(){ return journey()?.getSessionId() ?? ''; }
export function getEvents():WanderlyEvent[]{ return journey()?.getEvents() ?? []; }
/** This tab's current session and its events; empty without consent or a valid Site Profile. */
export function getCurrentJourney(){ return journey()?.currentJourney() ?? { sessionId:'', events:[] as WanderlyEvent[] }; }
export function track(eventType:WanderlyEventType, page:string, entity?:string, metadata?:Record<string,unknown>){
  return journey()?.track(eventType,page,entity,metadata);
}
export function clearCurrentSession(targetSid?:string){ journey()?.clearSession(targetSid); }
/** Clears all AAA journey history in this browser, for example when consent is denied. */
export function purgeJourneyHistory(){ journey()?.purge(); }
/**
 * Deletes this tab's journey once it has been idle for 30 minutes, while the
 * tab is open. Browsers may throttle or suspend timers in background tabs, so
 * reads also enforce expiry and the sweep reruns when the tab becomes visible.
 */
export function startJourneyExpirySweep(intervalMs=60_000){
  if(typeof window==='undefined') return ()=>{};
  const sweep=()=>{ journey()?.sweep(); };
  const onVisible=()=>{ if(document.visibilityState==='visible') sweep(); };
  sweep();
  const timer=window.setInterval(sweep,intervalMs);
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('pageshow',sweep);
  return ()=>{ window.clearInterval(timer); document.removeEventListener('visibilitychange',onVisible); window.removeEventListener('pageshow',sweep); };
}
