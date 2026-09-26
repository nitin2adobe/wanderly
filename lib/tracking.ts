'use client';
import { EVENT_STORAGE_KEY, EVENT_UPDATED, SESSION_STORAGE_KEY, WanderlyEvent, WanderlyEventType } from './events';

function id(prefix:string){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`}
export function getSessionId(){
  if(typeof window==='undefined') return '';
  let sid=sessionStorage.getItem(SESSION_STORAGE_KEY);
  if(!sid){sid=id('w'); sessionStorage.setItem(SESSION_STORAGE_KEY,sid);}
  return sid;
}
export function getEvents():WanderlyEvent[]{
  if(typeof window==='undefined') return [];
  try{return JSON.parse(localStorage.getItem(EVENT_STORAGE_KEY)||'[]') as WanderlyEvent[]}catch{return []}
}
export function track(eventType:WanderlyEventType, page:string, entity?:string, metadata?:Record<string,unknown>){
  if(typeof window==='undefined') return;
  const sessionId=getSessionId();
  const event:WanderlyEvent={id:id('e'),sessionId,timestamp:new Date().toISOString(),eventType,page,entity,metadata};
  const all=getEvents(); all.push(event);
  localStorage.setItem(EVENT_STORAGE_KEY,JSON.stringify(all.slice(-300)));
  window.dispatchEvent(new CustomEvent(EVENT_UPDATED,{detail:event}));
  return event;
}
export function clearCurrentSession(){
  if(typeof window==='undefined') return;
  const sid=getSessionId();
  localStorage.setItem(EVENT_STORAGE_KEY,JSON.stringify(getEvents().filter(e=>e.sessionId!==sid)));
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_UPDATED));
}
