'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AgentEyeView from '@/components/AgentEyeView';
import { demoScenarios } from '@/lib/demo-scenarios';
import PresenterToggle from '@/components/PresenterToggle';
import { EVENT_UPDATED } from '@/lib/events';
import { getCurrentJourney } from '@/lib/tracking';

/** Customer site on the left, the plugin's live decision trace on the right. */
export default function LiveDemoPage() {
  const [scenarioId, setScenarioId] = useState<string>(demoScenarios[0].id);
  const [runKey, setRunKey] = useState(0);
  const [manual, setManual] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    // The same-origin iframe shares this tab's sessionStorage, so its journey is this tab's session.
    const refresh = () => setSessionId(getCurrentJourney().sessionId);
    refresh();
    window.addEventListener(EVENT_UPDATED, refresh);
    window.addEventListener('storage', refresh);
    const timer = setInterval(refresh, 600);
    return () => {
      window.removeEventListener(EVENT_UPDATED, refresh);
      window.removeEventListener('storage', refresh);
      clearInterval(timer);
    };
  }, []);

  const scenario = demoScenarios.find(s => s.id === scenarioId)!;
  const start = (id: string) => { setManual(false); setScenarioId(id); setRunKey(k => k + 1); };
  const siteSrc = manual ? '/demo' : `/demo?run=${scenarioId}`;

  return (
    <main className="shell"><section className="section topspace">
      <div className="agentTop">
        <div>
          <div className="eyebrow">Demo · Live split view</div>
          <h1 className="display">Watch the concierge decide.</h1>
        </div>
        <div className="agentActions"><PresenterToggle /><Link className="btn ghost" href="/demo">All scenarios</Link></div>
      </div>
      <div className="scenarioTabs" role="tablist" aria-label="Scenario">
        {demoScenarios.map(s => (
          <button key={s.id} role="tab" aria-selected={!manual && s.id === scenarioId} className={!manual && s.id === scenarioId ? 'active' : ''} onClick={() => start(s.id)}>{s.title}</button>
        ))}
        <button role="tab" aria-selected={manual} className={manual ? 'active' : ''} onClick={() => { setManual(true); setRunKey(k => k + 1); }}>Manual journey</button>
        {!manual && <button className="replay" onClick={() => start(scenarioId)}>↻ Replay</button>}
      </div>
      <p className="muted"><strong>Expect:</strong> {manual ? 'In the customer site, select Reset demo, then browse normally to see the AAA trace for your own journey.' : scenario.expectation}</p>
      <div className="liveSplit">
        <div className="liveSite"><iframe key={runKey} title="Customer site" src={siteSrc} /></div>
        <div className="liveTrace"><AgentEyeView sessionId={sessionId} /></div>
      </div>
    </section></main>
  );
}
