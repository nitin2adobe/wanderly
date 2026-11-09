'use client';
import { useMemo } from 'react';
import type { PolicyOptions } from '@/lib/assistance-policy';
import type { WanderlyEvent } from '@/lib/events';
import { brandIdForPath, getBrandConfig } from '@/lib/brand-config';
import { buildSignalTimeline } from '@/lib/signal-timeline';

/** One pill per visitor event, coloured by the decision after that event; flips are outlined. */
export default function SignalTimeline({ events, options }: { events: WanderlyEvent[]; options?: PolicyOptions }) {
  const steps = useMemo(() => buildSignalTimeline(events, options), [events, options]);
  const labels = getBrandConfig(brandIdForPath(events.at(-1)?.page ?? null))?.eventLabels;
  if (!steps.length) return <p className="muted">No journey signals yet.</p>;
  return (
    <ol className="signalTimeline" aria-label="Decision after each visitor event">
      {steps.map(step => (
        <li key={step.index} className={`tl-${step.decision.toLowerCase()}${step.flipped ? ' flipped' : ''}`}>
          <span className="tlLabel">{labels?.[step.eventType] ?? step.eventType.replaceAll('_', ' ')}{step.entity ? ` · ${step.entity}` : ''}</span>
          <strong>{step.decision}{step.flipped ? ' ↺' : ''}</strong>
          {step.decision === 'ASSIST' && <small>{step.policyRule === 'ALLOWED' ? 'allowed' : step.policyRule.toLowerCase().replaceAll('_', ' ')}</small>}
        </li>
      ))}
    </ol>
  );
}
