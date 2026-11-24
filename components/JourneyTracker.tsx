'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getEvents, getSessionId, track } from '@/lib/tracking';
import { pageSignals } from '@/lib/page-signals';
import { conciergePageDestination } from '@/lib/concierge-context';
export default function JourneyTracker(){
  const pathname=usePathname(); const last=useRef('');
  const destinationParam=useSearchParams().get('destination');
  useEffect(()=>{
    if(!pathname || pathname==='/agent') return;
    const destination=conciergePageDestination(pathname,destinationParam ? `?destination=${encodeURIComponent(destinationParam)}` : '');
    const page=destinationParam && destination ? `${pathname}?destination=${destination.slug}` : pathname;
    if(last.current===page) return;
    last.current=page;
    const sid=getSessionId();
    if(!getEvents().some(e=>e.sessionId===sid)) track('SESSION_START',page);
    track('PAGE_VIEW',page);
    for(const signal of pageSignals(pathname)) track(signal.eventType,page,signal.eventType==='TRAVEL_INFO_VIEW' ? destination?.slug : signal.entity);
  },[pathname,destinationParam]);
  return null;
}
