'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { proposeAssistance } from '@/lib/activation-proposal';
import { decideAssistance, type DecisionResult } from '@/lib/assistance-decision';
import type { WanderlyEvent } from '@/lib/events';
import { buildJourneyContext } from '@/lib/journey-context';
import { agreementFor, summariseAgreement, type ComparisonRow } from '@/lib/proposal-comparison';

type AiResult = Pick<ComparisonRow, 'ai' | 'source' | 'latencyMs'>;

// Results are cached per journey context so replays and polling never re-spend the reasoner's rate limit.
const cache = new Map<string, AiResult>();

function Card({ title, badge, decision, extra }: { title: string; badge: string; decision: DecisionResult; extra?: string }) {
  return (
    <div className={`compareCard decision-${decision.decision.toLowerCase()}`}>
      <div className="compareHead"><strong>{title}</strong><span className="compareBadge">{badge}</span></div>
      <div className="compareDecision">{decision.decision}{decision.assistanceType !== 'NONE' ? ` · ${decision.assistanceType.replaceAll('_', ' ')}` : ''}</div>
      <small>Confidence {Math.round(decision.confidence * 100)}%{extra ? ` · ${extra}` : ''}</small>
      <p>{decision.reason}</p>
    </div>
  );
}

/** Rules proposal next to the AI proposal for the same journey, with a running agreement count. */
export default function RulesVsAI({ events }: { events: WanderlyEvent[] }) {
  const sessionId = events[0]?.sessionId ?? '';
  const context = useMemo(() => buildJourneyContext(events), [events]);
  const key = useMemo(() => JSON.stringify(context), [context]);
  const rules = useMemo(() => decideAssistance(context), [context]);
  const [rowsBySession, setRowsBySession] = useState<Record<string, ComparisonRow[]>>({});
  const [loading, setLoading] = useState(false);
  // The events array is rebuilt on every poll, so the effect is keyed on the stable context string only.
  const latest = useRef({ context, rules });
  latest.current = { context, rules };

  useEffect(() => {
    const { context: ctx, rules: rulesDecision } = latest.current;
    if (!sessionId || ctx.semanticEventCount === 0) return;
    let cancelled = false;
    const record = (result: AiResult) => {
      if (cancelled) return;
      setRowsBySession(prev => {
        const rows = prev[sessionId] ?? [];
        const row: ComparisonRow = { key, rules: rulesDecision, ...result };
        return { ...prev, [sessionId]: [...rows.filter(r => r.key !== key), row] };
      });
      setLoading(false);
    };
    const hit = cache.get(key);
    if (hit) { record(hit); return () => { cancelled = true; }; }
    setLoading(true);
    const started = performance.now();
    proposeAssistance(ctx, true).then(proposal => {
      const result: AiResult = { ai: proposal.decision, source: proposal.source, latencyMs: Math.round(performance.now() - started) };
      if (proposal.source !== 'rules-fallback') cache.set(key, result);
      record(result);
    });
    return () => { cancelled = true; };
  }, [sessionId, key]);

  const rows = rowsBySession[sessionId] ?? [];
  const current = rows.find(r => r.key === key);
  const summary = summariseAgreement(rows);

  return (
    <div className="panel rulesVsAi">
      <div className="traceHead">
        <div className="eyebrow">Rules vs AI · same journey</div>
        {current && <span className={`agreeTag agree-${agreementFor(current).toLowerCase()}`}>{agreementFor(current)}</span>}
      </div>
      <div className="compareGrid">
        <Card title="Rules" badge="deterministic" decision={rules} />
        {current
          ? <Card title="AI reasoner" badge={current.source.replace('-', ' ').toUpperCase()} decision={current.ai} extra={`${current.latencyMs} ms`} />
          : <div className="compareCard"><div className="compareHead"><strong>AI reasoner</strong></div><p className="muted">{loading ? 'Reasoning…' : 'Waiting for journey signals.'}</p></div>}
      </div>
      {current?.source === 'rules-fallback' && <p className="muted">The AI reasoner was unavailable, so the AI column shows the rules fallback and is not counted.</p>}
      <p className="muted">
        Agreement across {summary.total} journey state{summary.total === 1 ? '' : 's'} this session: <strong>{summary.agreed} agree</strong>, <strong>{summary.disagreed} disagree</strong>
        {summary.unavailable ? `, ${summary.unavailable} unavailable` : ''}. {current?.source === 'ai-mock' && 'AI here is the labelled mock provider, not a real model.'}
      </p>
    </div>
  );
}
