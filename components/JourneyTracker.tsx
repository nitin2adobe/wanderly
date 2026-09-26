'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getEvents, getSessionId, track } from '@/lib/tracking';

function semantic(path:string){
  if(path.startsWith('/destinations/')) return {type:'DESTINATION_VIEW' as const,entity:path.split('/')[2]};
  if(path==='/compare') return {type:'COMPARE_VIEW' as const};
  if(path==='/packages') return {type:'PACKAGE_VIEW' as const, entity:'packages'};
  if(path==='/travel-info') return {type:'TRAVEL_INFO_VIEW' as const};
  if(path==='/booking') return {type:'BOOKING_START' as const};
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
