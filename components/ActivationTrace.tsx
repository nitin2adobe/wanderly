'use client';
import { useEffect, useMemo, useState } from 'react';
import { ACTIVATION_MODE_CHANGED, getActivationMode, setActivationMode, type ActivationMode } from '@/lib/activation-mode';
import { decideAssistance } from '@/lib/assistance-decision';
import { recordedActivationProposal } from '@/lib/activation-proposal';
import { conciergeMetrics, summariseOutcomes } from '@/lib/assistance-outcomes';
import { deriveMemory } from '@/lib/assistance-memory';
import { evaluatePolicy } from '@/lib/assistance-policy';
import type { ConciergeHandoff } from '@/lib/concierge-handoff';
import type { WanderlyEvent } from '@/lib/events';
import SignalTimeline from './SignalTimeline';
import { usePolicyOptions } from './use-policy-options';
import { buildJourneyContext } from '@/lib/journey-context';

/** Live view of decision -> policy -> invitation -> outcome for one session's events. */
export default function ActivationTrace({ events, showHandoff = true }: { events: WanderlyEvent[]; showHandoff?: boolean }) {
  const options = usePolicyOptions();
  const [mode, setMode] = useState<ActivationMode>('rules');
  const context = useMemo(() => buildJourneyContext(events), [events]);
  const proposal = recordedActivationProposal(events, context, mode === 'ai');
  const decision = proposal?.decision ?? (mode === 'rules' ? decideAssistance(context) : undefined);
  const policy = decision ? evaluatePolicy(decision, context, events, new Date(), options) : undefined;
  const lifecycle = events.filter(e => e.eventType.startsWith('ASSISTANCE_') && e.eventType !== 'ASSISTANCE_EVALUATED');
  const status = lifecycle.filter(e => e.eventType !== 'ASSISTANCE_PREFERENCE').at(-1)?.eventType;
  const outcomes = summariseOutcomes(events);
  const metrics = conciergeMetrics(events);
  const memory = useMemo(() => deriveMemory(events), [events]);
  const handoff = [...lifecycle].reverse().map(e => e.metadata?.handoff as ConciergeHandoff | undefined).find(Boolean);
  const stage = status?.replace('ASSISTANCE_', '').replaceAll('_', ' ') ?? 'No invitation yet';
  useEffect(() => {
    const sync = () => setMode(getActivationMode());
    sync();
    window.addEventListener(ACTIVATION_MODE_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVATION_MODE_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <div className="panel">
      <div className="traceHead">
        <div className="eyebrow">Concierge activation trace</div>
        <div className="modeToggle" role="group" aria-label="Activation source">
          <button className={mode === 'rules' ? 'active' : ''} onClick={() => setActivationMode('rules')}>Rules</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setActivationMode('ai')}>AI-assisted</button>
        </div>
      </div>
      <div className="traceSteps">
        <div><span>1 · Active decision</span><strong>{decision ? `${decision.decision}${decision.assistanceType !== 'NONE' ? ` · ${decision.assistanceType.replaceAll('_', ' ')}` : ''}` : 'Awaiting active evaluation'}</strong><small>{proposal ? `Used by plugin · ${proposal.source}` : mode === 'ai' ? 'The rules baseline does not control AI-assisted activation.' : 'Rules preview; awaiting plugin evaluation.'}</small></div>
        <div><span>2 · Current policy gate</span><strong className={policy?.allowed ? 'traceAllowed' : 'traceBlocked'}>{policy ? `${policy.allowed ? 'ALLOWED' : 'BLOCKED'} · ${policy.rule}` : 'Awaiting active evaluation'}</strong><small>{policy?.reason}</small></div>
        <div><span>3 · Invitation</span><strong>{stage}</strong></div>
      </div>
      <div className="eyebrow" style={{ marginTop: 16 }}>Rules baseline after each signal</div>
      <SignalTimeline events={events} options={options} />
      {lifecycle.length > 0 && (
        <div className="journeyChips">
          {lifecycle.map(e => <span key={e.id}>{new Date(e.timestamp).toLocaleTimeString()} · {e.eventType.replace('ASSISTANCE_', '')}{e.metadata?.source ? ` · ${String(e.metadata.source)}` : ''}{e.metadata?.reason ? ` (${String(e.metadata.reason)})` : ''}</span>)}
        </div>
      )}
      <div className="eyebrow" style={{ marginTop: 16 }}>Invitation outcomes</div>
      {outcomes.length
        ? <div className="journeyChips">{outcomes.map((o, i) => <span key={i}>{o.assistanceType.replaceAll('_', ' ')} · {o.response.replace('_', ' ')}{o.priority ? ` · priority ${o.priority}` : ''} · {o.progressedAfter ? 'progressed after' : 'no progression yet'}</span>)}</div>
        : <p className="muted">No invitations in this session.</p>}
      <div className="eyebrow" style={{ marginTop: 16 }}>Acknowledged BC delivery and engagement</div>
      <div className="journeyChips">
        <span>Requested: {metrics.requested}</span><span>Opened: {metrics.opened}</span>
        <span>Opening failures: {metrics.openingFailures}</span><span>Cancelled: {metrics.cancelled}</span>
        <span>Queries: {metrics.queries}</span><span>Completed responses: {metrics.completedResponses}</span>
        <span>Service errors: {metrics.serviceErrors}</span>
        <span>Feedback: {metrics.positiveFeedback} positive / {metrics.negativeFeedback} negative</span>
        <span>Average observed streaming: {metrics.averageStreamingMs === null ? 'not measured' : `${metrics.averageStreamingMs} ms`}</span>
      </div>
      <p className="muted">Opened is not submitted or resolved. Response completion does not prove answer correctness. Streaming time is not total query latency. Events are local to this browser; progression is correlation, not uplift.</p>
      <div className="eyebrow" style={{ marginTop: 16 }}>Session memory (used by the next decision)</div>
      <div className="journeyChips">
        <span>Visitor dismissals: {memory.visitorDismissals}{memory.visitorDismissals >= 2 ? ' → stopped' : memory.visitorDismissals === 1 ? ' → cooldown doubles' : ''}</span>
        <span>Accepted: {memory.acceptedTypes.length ? memory.acceptedTypes.map(t => t.replaceAll('_', ' ')).join(', ') : 'none'}</span>
        <span>Stated priority: {memory.preferredPriority ?? 'none yet'}</span>
      </div>
      {showHandoff && (
        <>
          <div className="eyebrow" style={{ marginTop: 16 }}>Invitation payload (local only)</div>
          <p className="muted">Only an approved suggested question (current catalog names, practical topic and any explicitly chosen priority) enters the Adobe client. The local session ID and raw events are not forwarded in the question. Default delivery requires visitor submission; legacy automatic submission is opt-in. BC knowledge must be published separately.</p>
          {handoff ? <pre className="handoffJson">{JSON.stringify(handoff, null, 2)}</pre> : <p className="muted">No handoff yet. A payload is created when an invitation is shown.</p>}
        </>
      )}
    </div>
  );
}
