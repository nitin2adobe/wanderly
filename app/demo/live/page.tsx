'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ActivationTrace from '@/components/ActivationTrace';
import { demoScenarios } from '@/lib/demo-scenarios';
import PresenterToggle from '@/components/PresenterToggle';
import PolicyControls from '@/components/PolicyControls';
import RulesVsAI from '@/components/RulesVsAI';
import { EVENT_UPDATED, type WanderlyEvent } from '@/lib/events';
import { getEvents, getLatestSessionId } from '@/lib/tracking';

/** Customer site on the left, the plugin's live decision trace on the right. */
export default function LiveDemoPage() {
  const [scenarioId, setScenarioId] = useState<string>(demoScenarios[0].id);
  const [brand, setBrand] = useState<'wanderly' | 'electronics'>('wanderly');
  const [runKey, setRunKey] = useState(0);
  const [events, setEvents] = useState<WanderlyEvent[]>([]);

  useEffect(() => {
    // The embedded site has its own tab session; follow whichever session wrote events last.
    const refresh = () => {
      const sid = getLatestSessionId();
      setEvents(getEvents().filter(e => e.sessionId === sid));
    };
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
  const start = (id: string) => { setScenarioId(id); setRunKey(k => k + 1); };
  const switchBrand = (next: 'wanderly' | 'electronics') => { setBrand(next); setRunKey(k => k + 1); };
  const siteSrc = `${brand === 'wanderly' ? '/demo' : '/demo/electronics'}?run=${scenarioId}`;

  return (
    <main className="shell"><section className="section topspace">
      <div className="agentTop">
        <div>
          <div className="eyebrow">Demo · Live split view</div>
          <h1 className="display">Watch the concierge decide.</h1>
        </div>
        <div className="agentActions"><PresenterToggle /><Link className="btn ghost" href="/demo">All scenarios</Link></div>
      </div>
      <div className="scenarioTabs" role="group" aria-label="Brand">
        <button className={brand === 'wanderly' ? 'active' : ''} aria-pressed={brand === 'wanderly'} onClick={() => switchBrand('wanderly')}>Wanderly (travel)</button>
        <button className={brand === 'electronics' ? 'active' : ''} aria-pressed={brand === 'electronics'} onClick={() => switchBrand('electronics')}>Volt Electronics (fixture)</button>
      </div>
      <div className="scenarioTabs" role="tablist" aria-label="Scenario">
        {demoScenarios.map(s => (
          <button key={s.id} role="tab" aria-selected={s.id === scenarioId} className={s.id === scenarioId ? 'active' : ''} onClick={() => start(s.id)}>{s.title}</button>
        ))}
        <button className="replay" onClick={() => start(scenarioId)}>↻ Replay</button>
      </div>
      <p className="muted"><strong>Expect:</strong> {brand === 'electronics' ? scenario.electronics.expectation : scenario.expectation}{brand === 'electronics' && ' (Fixture storefront: same engine, a second brand through an adapter.)'}</p>
      <div className="liveSplit">
        <div className="liveSite"><iframe key={`${brand}-${runKey}`} title="Customer site" src={siteSrc} /></div>
        <div className="liveTrace"><ActivationTrace events={events} showHandoff={false} /><RulesVsAI events={events} /><PolicyControls /></div>
      </div>
    </section></main>
  );
}
