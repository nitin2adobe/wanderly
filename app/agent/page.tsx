'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AaaStarterTrace from '@/components/AaaStarterTrace';
import { useAaaAvailability } from '@/components/AaaConsent';
import { EVENT_UPDATED } from '@/lib/events';
import { clearCurrentSession, getCurrentJourney } from '@/lib/tracking';

export default function AgentPage() {
  const aaa = useAaaAvailability();
  const [sessionId, setSessionId] = useState('');
  useEffect(() => {
    const refresh = () => setSessionId(getCurrentJourney().sessionId);
    refresh();
    window.addEventListener(EVENT_UPDATED, refresh);
    window.addEventListener('storage', refresh);
    const timer = setInterval(refresh, 800);
    return () => {
      window.removeEventListener(EVENT_UPDATED, refresh);
      window.removeEventListener('storage', refresh);
      clearInterval(timer);
    };
  }, [aaa.enabled]);
  return <main className="shell"><section className="section topspace">
    <div className="agentTop">
      <div>
        <h1 className="display">This tab’s Wanderly session.</h1>
        <p className="muted">Browse Wanderly in this tab and return to inspect its client activation record. Opening this inspector does not generate starters.</p>
        {!aaa.enabled && <p className="muted" role="status">{aaa.reason === 'profile.unavailable' ? 'No valid Site Profile is active.' : 'No client journey is shown until demo assistance is enabled.'}</p>}
      </div>
      <div className="agentActions"><Link className="btn" href="/">Open Wanderly</Link><button className="btn ghost" onClick={() => { clearCurrentSession(sessionId); setSessionId(getCurrentJourney().sessionId); }}>New session</button></div>
    </div>
    <h2>Client activation in this tab</h2>
    <div className="panel"><AaaStarterTrace sessionId={sessionId} /></div>
  </section></main>;
}
