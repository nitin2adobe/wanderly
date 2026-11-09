'use client';
import { useEffect, useRef } from 'react';
import { setActivationMode } from '@/lib/activation-mode';
import { electronicsAdapter, type ElectronicsEvent } from '@/lib/brand-adapters';
import { electronicsCatalog } from '@/lib/brand-config';
import { trackAdapted } from '@/lib/brand-tracking';
import { demoScenarios } from '@/lib/demo-scenarios';
import { clearCurrentSession, getSessionId, track } from '@/lib/tracking';

const PAGE = '/demo/electronics';
const slug = (name: string) => name.toLowerCase().replaceAll(' ', '-');
const faqs = ['Does the warranty cover battery wear?', 'Is accidental damage covered?', 'How do I claim support?'];

/** FIXTURE ONLY: a second brand whose events reach the same activation engine through an adapter. */
export default function ElectronicsDemoPage() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const send = (raw: ElectronicsEvent) => trackAdapted(electronicsAdapter, raw, PAGE);

  const run = (id: string) => {
    const scenario = demoScenarios.find(s => s.id === id);
    if (!scenario) return;
    timers.current.forEach(clearTimeout);
    clearCurrentSession(getSessionId());
    setActivationMode('rules');
    track('SESSION_START', PAGE);
    scenario.electronics.events.forEach(send);
    const { followUp } = scenario.electronics;
    if (followUp) timers.current = [setTimeout(() => followUp.events.forEach(send), followUp.delayMs)];
  };

  const autoRan = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('run');
    if (!id || autoRan.current) return;
    autoRan.current = true;
    run(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="shell"><section className="section topspace">
      <div className="eyebrow">Volt Electronics · Demo storefront (fixture brand)</div>
      <h1 className="display">Find the right laptop.</h1>
      <p className="muted">A second brand using the same activation plugin through an adapter. Illustrative catalog, not a real integration.</p>
      <div className="demoGrid">
        {electronicsCatalog.map(p => (
          <div className="panel" key={p.name}>
            <h2>{p.name}</h2>
            <p><strong>{p.price}</strong></p>
            <p className="muted">{p.features}</p>
            <button className="btn" onClick={() => send({ type: 'PRODUCT_VIEW', sku: slug(p.name) })}>View details</button>
          </div>
        ))}
      </div>
      <div className="agentActions" style={{ marginTop: 24 }}>
        <button className="btn ghost" onClick={() => send({ type: 'SPEC_COMPARE' })}>Compare specs</button>
        <button className="btn" onClick={() => send({ type: 'CHECKOUT_START' })}>Checkout</button>
      </div>
      <div className="panel" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 26 }}>Warranty questions</h2>
        <ul className="list">
          {faqs.map(q => <li key={q} onClick={() => send({ type: 'WARRANTY_FAQ', question: q })}>{q}</li>)}
        </ul>
      </div>
    </section></main>
  );
}
