'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getEvents, getSessionId, startJourneyExpirySweep, startCanonicalInputs, track } from '@/lib/tracking';
import { pageSignals } from '@/lib/page-signals';
import { conciergePageDestination } from '@/lib/concierge-context';
import { useAaaAvailability } from '@/components/AaaConsent';
import { getPackage } from '@/lib/data';
export default function JourneyTracker(){
  const pathname=usePathname(); const last=useRef('');
  const searchParams=useSearchParams();
  const destinationParam=searchParams.get('destination');
  const packageParam=searchParams.get('package');
  const bookingQuery=pathname==='/booking' ? searchParams.toString() : '';
  const aaa=useAaaAvailability();
  useEffect(()=>startJourneyExpirySweep(),[]);
  useEffect(()=>aaa.enabled ? startCanonicalInputs() : undefined,[aaa.enabled]);
  useEffect(()=>{
    if(!aaa.enabled){last.current='';return;}
    if(!pathname || pathname==='/agent' || pathname==='/demo/compare') return;
    const query=new URLSearchParams();
    if(destinationParam!==null) query.set('destination',destinationParam);
    const destination=conciergePageDestination(pathname,pathname==='/booking' ? bookingQuery : query.toString());
    const pack=pathname==='/booking' && new URLSearchParams(bookingQuery).getAll('package').length===1 ? getPackage(packageParam ?? '') : undefined;
    const canonical=new URLSearchParams();
    if(destination && (destinationParam || pathname==='/booking')) canonical.set('destination',destination.slug);
    if(pack && pack.slug===destination?.slug) canonical.set('package',pack.id);
    const page=canonical.size ? `${pathname}?${canonical.toString()}` : pathname;
    if(last.current===page) return;
    last.current=page;
    const sid=getSessionId();
    if(!getEvents().some(e=>e.sessionId===sid)) track('SESSION_START',page);
    track('PAGE_VIEW',page);
    for(const signal of pageSignals(pathname)) track(signal.eventType,page,signal.eventType==='TRAVEL_INFO_VIEW' ? destination?.slug : signal.entity);
  },[pathname,destinationParam,packageParam,bookingQuery,aaa.enabled]);
  return null;
}
