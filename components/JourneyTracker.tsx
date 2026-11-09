'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getEvents, getSessionId, track } from '@/lib/tracking';

function semantic(path:string){
  if(path.startsWith('/destinations/')){
    // Only slug-shaped values become entities; arbitrary URL text must not reach storage, prompts or handoffs.
    const slug=path.split('/')[2];
    return /^[a-z0-9-]{1,40}$/.test(slug)?{type:'DESTINATION_VIEW' as const,entity:slug}:null;
  }
  if(path==='/compare') return {type:'COMPARE_VIEW' as const};
  if(path==='/packages') return {type:'PRICE_VIEW' as const};
  if(path==='/travel-info') return {type:'TRAVEL_INFO_VIEW' as const};
  return null;
}
export default function JourneyTracker(){
  const pathname=usePathname(); const last=useRef('');
  useEffect(()=>{
    if(!pathname || pathname==='/agent' || last.current===pathname) return;
    last.current=pathname;
    const sid=getSessionId();
    if(!getEvents().some(e=>e.sessionId===sid)) track('SESSION_START',pathname);
    track('PAGE_VIEW',pathname);
    const s=semantic(pathname); if(s) track(s.type,pathname,s.entity);
  },[pathname]);
  return null;
}
