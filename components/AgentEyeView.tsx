'use client';

import { useEffect, useState } from 'react';
import { AAA_TRACE_CHANGED, acceptFrameActivationTrace, getActivationTraces } from '@/lib/aaa-activation';
import { consideredReasons, decisionDetails, explainReason, friendlyExplainId, provenanceLabel } from '@/lib/aaa-explain-labels';
import GroundingScoreboard from '@/components/GroundingScoreboard';
import { AAA_TIMING_CHANGED, acceptFrameTimingEntry, timingTimeline, type TimingEntry } from '@/lib/aaa-timing';
import { timingOutcomeLabel, timingPointLabel, timingReasonLabels } from '@/lib/aaa-timing-labels';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const names = (values: unknown[]) => values.filter((value): value is string => typeof value === 'string').join(', ');
const elapsed = (entry: TimingEntry) => {
  const seconds = Math.max(0, Math.floor((entry.at - entry.startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const pageLabel = (entry: TimingEntry) => {
  if (entry.pageType === 'comparison') return 'Compare';
  return entry.entityNames[0] ?? ({
    home: 'Home', 'destination-list': 'Destinations', 'destination-detail': 'Destination',
    'package-list': 'Packages', 'package-detail': 'Package', 'practical-info': 'Travel information',
    booking: 'Booking',
  }[entry.pageType] ?? 'Page');
};

export default function AgentEyeView({ sessionId }: { sessionId: string }) {
  const [traceId, setTraceId] = useState<string>();
  const [data, setData] = useState<RecordValue>();
  const [status, setStatus] = useState('Waiting for an eligible journey.');
  const [timingEntries, setTimingEntries] = useState<readonly TimingEntry[]>([]);
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event && 'detail' in event) acceptFrameTimingEntry(event.detail);
      setTimingEntries([...timingTimeline(sessionId)]);
    };
    sync();
    window.addEventListener(AAA_TIMING_CHANGED, sync);
    return () => window.removeEventListener(AAA_TIMING_CHANGED, sync);
  }, [sessionId]);
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event && 'detail' in event) acceptFrameActivationTrace(event.detail);
      setTraceId(getActivationTraces(sessionId).findLast(entry => entry.traceId)?.traceId);
    };
    sync();
    window.addEventListener(AAA_TRACE_CHANGED, sync);
    return () => window.removeEventListener(AAA_TRACE_CHANGED, sync);
  }, [sessionId]);
  useEffect(() => {
    setData(undefined);
    if (!traceId) { setStatus('Waiting for an eligible journey.'); return; }
    const controller = new AbortController();
    setStatus('Loading this decision…');
    fetch(`/api/aaa/explain/${traceId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Explanation unavailable or expired.');
        const value: unknown = await response.json();
        const result = object(value);
        if (result.schemaVersion !== 'aaa-explain-1') throw new Error('Explanation has an unsupported format.');
        setData(result);
        setStatus('');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error('[aaa-explain] display.failed', error);
        setStatus('Explanation unavailable or expired. Run the journey again.');
      });
    return () => controller.abort();
  }, [traceId]);

  const digest = object(data?.digest);
  const catalog = list(data?.digestCatalog).map(object);
  const nameFor = (id: unknown) => text(catalog.find(item => item.id === id)?.name) || friendlyExplainId(text(id));
  const entities = list(digest.entities).map(object);
  const considered = list(data?.considered).map(object);
  const calls = list(data?.toolCalls).map(object);
  const selection = object(data?.selection);
  const decision = decisionDetails(data ?? {});
  const wording = object(data?.wording);
  const starters = list(wording.starters).map(object);
  const validation = object(data?.validation);
  const brief = object(data?.visitorBrief);
  const why = object(data?.why);
  const models = list(data?.modelCalls).map(object);
  return <section className="agentEye panel" aria-labelledby="agent-eye-title">
    <h2 id="agent-eye-title">The agent’s view</h2>
    <p className="muted">A visitor-safe record of this decision, not a model transcript.</p>
    {process.env.NEXT_PUBLIC_AAA_TIMING === 'agent' && <section aria-labelledby="timing-title">
      <h3 id="timing-title">When to step in</h3>
      {timingEntries.length === 0 ? <p>No timing decisions yet.</p> : <>
        <ol className="timingTimeline" aria-live="polite">
          {timingEntries.map(entry => <li key={`${entry.point.pageInstanceId}-${entry.point.sequence}`}>
            <span>{elapsed(entry)} · {entry.point.kind === 'revisit'
              ? `Back to ${pageLabel(entry)}` : `${pageLabel(entry)} · ${timingPointLabel(entry.point.kind)}`}</span>
            <p><strong>{timingOutcomeLabel(entry.source, entry.outcome, entry.reasonCodes)}</strong>
              {entry.source === 'agent' && timingReasonLabels(entry.reasonCodes, entry.entityNames).map(reason => <span key={reason}> · {reason}</span>)}
            </p>
            {(entry.judgments || entry.confidence) && <details>
              <summary>Technical details</summary>
              {entry.judgments && <p>Self-reported judgments: welcome now {entry.judgments.welcomeNow}; making progress {entry.judgments.makingProgress}; stuck {entry.judgments.stuck}.</p>}
              {entry.confidence && <p>Self-reported confidence: {entry.confidence}.</p>}
            </details>}
          </li>)}
        </ol>
        {(() => {
          const first = timingEntries.find(entry => entry.rulesWouldAssist);
          return first && <p className="muted">Rules would have stepped in at {elapsed(first)} on the {pageLabel(first)} page.</p>;
        })()}
      </>}
    </section>}
    <GroundingScoreboard />
    <div aria-live="polite">
      {status && <p role="status">{status}</p>}
      {data && <>
        <section><h3>What the agent saw</h3>
          <p>{entities.length ? `Viewed: ${entities.map(entity => nameFor(entity.id)).join(', ')}.` : 'No catalog items were recorded.'}</p>
          {list(digest.comparison).length === 2 && <p>Compared: {list(digest.comparison).map(nameFor).join(' and ')}.</p>}
          {list(digest.topics).length > 0 && <p>Topics: {list(digest.topics).map(item => friendlyExplainId(text(object(item).id))).join(', ')}.</p>}
          {text(digest.stage) && <p>Journey stage: {friendlyExplainId(text(digest.stage))}.</p>}
        </section>
        <section><h3>What it considered</h3>
          {considered.length ? <ul>{considered.map((item, i) => <li key={i}>
            {friendlyExplainId(text(item.playbookId)) || 'Help option'}: {item.eligible ? 'eligible' : 'not eligible'}
            {consideredReasons(item).map((reason, index) => <span key={`${reason}-${index}`}> · {reason}</span>)}
          </li>)}</ul> : <p>No help options recorded.</p>}
        </section>
        <section><h3>What it looked up</h3>
          {calls.length ? <ul>{calls.map((call, i) => <li key={i}>
            {friendlyExplainId(text(call.name))}: {names(list(call.returned).map(item => text(object(item).displayName))) || friendlyExplainId(text(call.outcome)) || 'No results'}
          </li>)}</ul> : <p>No lookups recorded.</p>}
        </section>
        <section><h3>What it decided</h3>
          <p>{data.outcome === 'abstain' ? 'Stayed quiet.' : data.outcome === 'fallback' ? 'Used approved wording.' : data.outcome === 'assist' ? 'Offered help.' : 'Decision not recorded.'}
            {text(selection.playbookId) && ` ${friendlyExplainId(text(selection.playbookId))}.`}
            {explainReason(text(data.reasonCode)) && ` ${explainReason(text(data.reasonCode))}.`}
          </p>
          {decision.rulesChoice && <p>{decision.rulesChoice}</p>}
          {decision.reasons.map(reason => <p key={reason}>{reason.charAt(0).toUpperCase() + reason.slice(1)}.</p>)}
        </section>
        <section><h3>What it wrote</h3>
          {text(object(wording.headline).text) && <p>{text(object(wording.headline).text)}</p>}
          {starters.length ? <ul>{starters.map((starter, i) => <li key={i}><span>{text(starter.text)}</span> <small className="agentEyeBadge">{provenanceLabel(text(starter.source))}</small></li>)}</ul> : <p>No questions offered.</p>}
          {text(why.text) && <p>{text(why.text)}</p>}
        </section>
        <section><h3>Safety checks</h3>
          {Object.keys(validation).length ? <ul>{Object.entries(validation).map(([key, value]) => <li key={key}>{friendlyExplainId(key)}: {Array.isArray(value) ? names(value) || 'No results' : friendlyExplainId(text(value)) || 'Not recorded'}</li>)}</ul> : <p>No contextual check result recorded.</p>}
        </section>
        <section><h3>Sent to Concierge</h3>
          <p>{text(brief.text) || 'No visitor brief was available.'}</p>
          <p className="muted">The brief is eligible to be sent only while chat is open; delivery is not verified by this trace.</p>
        </section>
        <section><h3>Cost</h3>
          <p>{typeof data.elapsedMs === 'number' ? `${data.elapsedMs} ms total.` : 'Total duration not recorded.'}
            {models.length ? ` ${models.length} model ${models.length === 1 ? 'call' : 'calls'}.` : ' No model calls recorded.'}</p>
          {models.map((model, i) => {
            const usage = object(model.usage);
            return (typeof usage.inputTokens === 'number' || typeof usage.outputTokens === 'number') && <p key={i}>Tokens: {typeof usage.inputTokens === 'number' ? usage.inputTokens : '—'} in, {typeof usage.outputTokens === 'number' ? usage.outputTokens : '—'} out.</p>;
          })}
        </section>
      </>}
    </div>
  </section>;
}
