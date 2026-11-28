'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { setActivationMode } from '@/lib/activation-mode';
import { CONCIERGE_CLOSE_EVENT } from '@/lib/concierge-connector';
import { resetDestinationComparison, useDestinationComparison } from '@/components/DestinationComparison';
import { EVENT_UPDATED } from '@/lib/events';
import PresenterToggle from '@/components/PresenterToggle';
import { demoScenarios, pageForEvent, type DemoScenario, type ScenarioEvent } from '@/lib/demo-scenarios';
import { clearCurrentSession, getSessionId, track } from '@/lib/tracking';

export default function DemoPage() {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingLanding = useRef<((event: Event) => void) | undefined>(undefined);
  const [active, setActive] = useState<DemoScenario | null>(null);
  const { toggleComparison } = useDestinationComparison();

  const replay = (events: ScenarioEvent[]) => events.forEach(([type, entity]) => track(type, pageForEvent(type, entity), entity));
  const stopTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (pendingLanding.current) window.removeEventListener(EVENT_UPDATED, pendingLanding.current);
    pendingLanding.current = undefined;
  };

  const reset = () => {
    stopTimers();
    window.dispatchEvent(new Event(CONCIERGE_CLOSE_EVENT));
    clearCurrentSession(getSessionId());
    resetDestinationComparison();
    setActivationMode('rules');
    setActive(null);
  };

  const run = (scenario: DemoScenario) => {
    reset();
    setActive(scenario);
    track('SESSION_START', '/demo');
    const faqEvents = scenario.events.filter(([type]) => type === 'FAQ_SEARCH');
    replay(scenario.events.filter(([type]) => type !== 'FAQ_SEARCH'));
    if (faqEvents.length) {
      const sid = getSessionId();
      const target = new URL(scenario.landingPage, window.location.origin);
      const atLanding = () => getSessionId() === sid && window.location.pathname === target.pathname && new URLSearchParams(window.location.search).get('destination') === target.searchParams.get('destination');
      const onLanding = (event: Event) => {
        const detail = event instanceof CustomEvent ? event.detail : undefined;
        if (detail?.eventType !== 'PAGE_VIEW' || (!atLanding() && getSessionId() === sid)) return;
        window.removeEventListener(EVENT_UPDATED, onLanding);
        pendingLanding.current = undefined;
        clearTimeout(expiry);
        queueMicrotask(() => { if (atLanding()) replay(faqEvents); });
      };
      pendingLanding.current = onLanding;
      window.addEventListener(EVENT_UPDATED, onLanding);
      const expiry = setTimeout(() => {
        window.removeEventListener(EVENT_UPDATED, onLanding);
        pendingLanding.current = undefined;
        console.error('The demo landing page was not observed; practical FAQ replay was cancelled.');
      }, 15_000);
      timers.current.push(expiry);
    }
    if (scenario.landingPage === '/compare') {
      const slugs = [...new Set(scenario.events.filter(([type]) => type === 'DESTINATION_VIEW').map(([, entity]) => entity).filter((entity): entity is string => !!entity))];
      slugs.forEach(toggleComparison);
    }
    if (scenario.followUp) {
      const { delayMs, events } = scenario.followUp;
      timers.current.push(setTimeout(() => replay(events), delayMs));
    }
    router.push(scenario.landingPage);
  };

  // `/demo?run=<id>` starts a scenario immediately; the live split view embeds the site this way.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const scenario = demoScenarios.find(s => s.id === new URLSearchParams(window.location.search).get('run'));
    if (!scenario) return;
    autoRan.current = true;
    run(scenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="shell"><section className="section topspace">
      <div className="eyebrow">Demo · Scenario replay</div>
      <h1 className="display">Concierge activation, on demand.</h1>
      <p className="muted">Explore destination comparison, package selection and practical travel questions, then test restraint and dismissal. Each scenario starts a fresh Wanderly session in Rules mode and closes the previous chat window; Adobe conversation history is preserved. Journey data is kept per browser tab, so open <Link href="/agent">the inspector</Link> in this tab, or use the live split view.</p>
      <div className="demoGrid">
        {demoScenarios.map(s => (
          <div className="panel" key={s.id}>
            <h2>{s.title}</h2>
            <p className="muted">{s.description}</p>
            <p><strong>Expect:</strong> {s.expectation}</p>
            <button className="btn" onClick={() => run(s)}>Run scenario</button>
          </div>
        ))}
      </div>
      <div className="agentActions" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={reset}>Reset demo</button>
        <Link className="btn ghost" href="/agent">Open inspector</Link>
        <Link className="btn" href="/demo/live">Live split view</Link>
        <PresenterToggle />
      </div>
      {active && <p className="muted">Last run: {active.title}</p>}
    </section></main>
  );
}
