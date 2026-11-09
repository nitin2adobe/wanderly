'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { setActivationMode } from '@/lib/activation-mode';
import PresenterToggle from '@/components/PresenterToggle';
import { demoScenarios, pageForEvent, type DemoScenario, type ScenarioEvent } from '@/lib/demo-scenarios';
import { clearCurrentSession, getSessionId, track } from '@/lib/tracking';

export default function DemoPage() {
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [active, setActive] = useState<DemoScenario | null>(null);

  const replay = (events: ScenarioEvent[]) => events.forEach(([type, entity]) => track(type, pageForEvent(type, entity), entity));
  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const reset = () => {
    stopTimers();
    clearCurrentSession(getSessionId());
    setActivationMode('rules');
    setActive(null);
  };

  const run = (scenario: DemoScenario) => {
    reset();
    setActive(scenario);
    track('SESSION_START', '/demo');
    replay(scenario.events);
    if (scenario.followUp) {
      const { delayMs, events } = scenario.followUp;
      timers.current.push(setTimeout(() => replay(events), delayMs));
    }
    // Land on the last journey page so the plugin runs in a normal customer context.
    router.push('/destinations/maldives');
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
      <p className="muted">Each scenario starts a fresh session, replays a journey, and opens the site so you can watch the plugin decide. Open <Link href="/agent">the inspector</Link> in a second tab (it follows the latest session).</p>
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
