'use client';

import { useEffect, useRef, useState } from 'react';
import { useAaaAvailability } from '@/components/AaaConsent';
import GroundingScoreboard from '@/components/GroundingScoreboard';
import { COMPARISON_SNAPSHOT_REQUEST, type ComparisonSnapshot } from '@/lib/aaa-comparison';
import { defaultConciergeWelcomeExamples } from '@/lib/concierge-context';
import { packageConciergeJourneyContext } from '@/lib/concierge-context-packager';
import { renderConciergeAmbientTemplate } from '@/lib/concierge-ambient-template';
import { validateContextualStarters } from '@/lib/aaa-contextual-starters';
import { staleStarterReason, type StarterResponse } from '@/lib/aaa-starters';
import { validateContract } from '@/aaa/contracts/validate';
import { getAaaRuntime } from '@/lib/aaa-runtime';
import { comparisonContext, validateComparisonStarter } from '@/sites/wanderly/comparison';
import { friendlyExplainId, provenanceLabel } from '@/lib/aaa-explain-labels';
import guidelines from '@/sites/wanderly/guidelines.json';

type Results = { agent: StarterResponse; templates: StarterResponse; snapshot: ComparisonSnapshot; elapsed: number };
const fallbackHeadline = (playbookId: string | null, locale: string) =>
  guidelines.playbooks.find(entry => entry.playbookId === playbookId && entry.locale === locale)?.approvedHeadline;

export default function CompareDemoPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const aaa = useAaaAvailability();
  const [results, setResults] = useState<Results>();
  const [quiet, setQuiet] = useState(false);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!aaa.enabled) {
      activeRequest.current?.abort();
      setResults(undefined);
      setQuiet(false);
    }
  }, [aaa.enabled]);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const capture = (target: Window) => new Promise<ComparisonSnapshot>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The customer journey did not respond.')), 2000);
    target.dispatchEvent(new CustomEvent(COMPARISON_SNAPSHOT_REQUEST, { detail: {
      respond: (value: ComparisonSnapshot) => { clearTimeout(timer); resolve(value); },
    } }));
  });

  const run = async () => {
    setResults(undefined);
    setQuiet(false);
    setStatus('');
    const availability = getAaaRuntime().get();
    if (!availability.enabled) { setStatus('Allow assistance before running the comparison.'); return; }
    const target = frame.current?.contentWindow;
    if (!target) { setStatus('The customer journey is not ready yet.'); return; }
    const controller = new AbortController();
    activeRequest.current = controller;
    setRunning(true);
    try {
      const snapshot = await capture(target);
      if (controller.signal.aborted) return;
      if (!snapshot.request) { setQuiet(true); return; }
      const started = performance.now();
      const response = await fetch('/api/aaa/compare', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot.request), cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Comparison service unavailable.');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('agent' in body) || !('templates' in body)) throw new Error('Invalid comparison response.');
      const latest = await capture(target);
      if (!getAaaRuntime().isEnabled() || !latest.request
        || latest.request.momentRuleId !== snapshot.request.momentRuleId
        || latest.request.journey.sessionId !== snapshot.request.journey.sessionId
        || latest.request.journey.profileVersion !== snapshot.request.journey.profileVersion
        || latest.request.journey.page.pageInstanceId !== snapshot.request.journey.page.pageInstanceId
        || latest.request.journey.page.pageRevision !== snapshot.request.journey.page.pageRevision) {
        throw new Error('The journey changed; run the comparison again.');
      }
      const parse = (value: unknown): StarterResponse => {
        if (!value || typeof value !== 'object' || !('result' in value)) throw new Error('Invalid comparison result.');
        const result = validateContract('StarterResult', value.result);
        if (!result.valid || staleStarterReason(result.value, snapshot.request!)) throw new Error('The comparison result is no longer current.');
        const scoped = validateComparisonStarter(result.value, comparisonContext(snapshot.request!.journey, availability.active.profile, snapshot.selection));
        if (!scoped && result.value.outcome !== 'abstain') throw new Error('The comparison no longer matches the selected destinations.');
        const contextual = 'schemaVersion' in value ? validateContextualStarters({
          schemaVersion: value.schemaVersion, result: value.result,
          ...('starterProvenance' in value ? { starterProvenance: value.starterProvenance } : {}),
          ...('headline' in value ? { headline: value.headline } : {}),
          ...('intentSummary' in value ? { intentSummary: value.intentSummary } : {}),
          ...('visitorBrief' in value ? { visitorBrief: value.visitorBrief } : {}),
          ...('why' in value ? { why: value.why } : {}),
          ...('rationale' in value ? { rationale: value.rationale } : {}),
        }) : undefined;
        if ('schemaVersion' in value && !contextual) throw new Error('Invalid contextual comparison result.');
        return {
          result: result.value,
          trace: { reasonCodes: [], tools: [], alternatives: [], validatorVerdicts: [], fallbackReasons: [], suppressionReasons: [] },
          ...(contextual ? {
            starterProvenance: contextual.starterProvenance, headline: contextual.headline,
            ...(contextual.schemaVersion !== 'aaa-contextual-starters-1' ? { visitorBrief: contextual.visitorBrief, why: contextual.why } : {}),
          } : {}),
        };
      };
      setResults({ agent: parse(body.agent), templates: parse(body.templates), snapshot, elapsed: Math.round(performance.now() - started) });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[aaa-comparison] failed', error);
      setStatus(error instanceof Error ? error.message : 'Comparison failed.');
    } finally {
      if (activeRequest.current === controller) activeRequest.current = undefined;
      setRunning(false);
    }
  };

  const profile = getAaaRuntime().get();
  const context = results && profile.enabled ? packageConciergeJourneyContext(profile.active.profile, results.snapshot.request!.journey) : undefined;
  const briefContext = results && profile.enabled ? packageConciergeJourneyContext(profile.active.profile, results.snapshot.request!.journey, results.agent.visitorBrief?.text) : undefined;
  const lane = (title: string, value: StarterResponse | undefined, agent = false) => {
    const primary = value?.result.starters.find(item => item.role === 'primary');
    const headline = value?.headline?.text ?? (value ? fallbackHeadline(value.result.playbookId, value.result.locale) : undefined);
    const ambient = results && renderConciergeAmbientTemplate(results.snapshot.page, agent ? briefContext : value ? context : undefined);
    return <section className="comparisonLane">
      <h2>{title}</h2>
      {quiet ? <p>Stayed quiet.</p> : !results ? <p>Run a journey to see this lane.</p> : <>
        {value && <><h3>Playbook</h3><p>{value.result.playbookId ? friendlyExplainId(value.result.playbookId) : 'No playbook selected.'}</p></>}
        <h3>Nudge</h3><p>{value ? primary ? `${headline ?? 'Optional help'} — ${primary.text}` : 'Stayed quiet.' : 'No nudge.'}</p>
        <h3>Starter questions</h3>
        <ul>{(value ? value.result.starters.map((item, index) => ({ text: item.text, source: value.starterProvenance?.[index]?.source ?? 'approved' })) : defaultConciergeWelcomeExamples().map(text => ({ text, source: '' }))).map((item, index) => <li key={index}>{item.text} {item.source && <small className="agentEyeBadge">{provenanceLabel(item.source)}</small>}</li>)}</ul>
        <h3>Why</h3><p>{value?.why?.text ?? 'No dynamic explanation.'}</p>
        <h3>What Concierge receives</h3>
        <p className="muted">Preview only: copy of tenant config, verify before the pitch. Actual delivery depends on opening chat.</p>
        <pre className="comparisonAmbient">{ambient}</pre>
        <h3>Latency</h3><p>{agent ? `${results.elapsed} ms end-to-end comparison request.` : value ? 'Local templates; included in comparison request.' : 'No agent request.'}</p>
      </>}
    </section>;
  };
  return <main className="shell"><section className="section topspace">
    <h1 className="display">Compare the approaches.</h1>
    <p className="muted">Run a journey in the customer site, then compare the same moment without recording another nudge exposure.</p>
    <GroundingScoreboard />
    <div className="liveSite"><iframe ref={frame} title="Customer journey" src="/demo" /></div>
    <div className="agentActions"><button className="btn" type="button" disabled={running} onClick={() => void run()}>{running ? 'Running comparison…' : 'Run comparison'}</button></div>
    {status && <p role="alert">{status}</p>}
    {quiet && <p role="status">No eligible assistance moment or a safety safeguard is active.</p>}
    {results?.agent.result.outcome === 'fallback' && <p role="status">The agent used approved fallback wording.</p>}
    <div className="comparisonLanes">{lane('Concierge alone', undefined)}{lane('Rules and templates', results?.templates)}{lane('AAA agent', results?.agent, true)}</div>
  </section></main>;
}
