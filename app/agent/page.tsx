'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EVENT_UPDATED, WanderlyEvent } from '@/lib/events';
import { clearCurrentSession, getEvents, getLatestSessionId } from '@/lib/tracking';
import { buildJourneyContext } from '@/lib/journey-context';
import { decideAssistance } from '@/lib/assistance-decision';
import { evaluatePolicy } from '@/lib/assistance-policy';
import { summariseOutcomes } from '@/lib/assistance-outcomes';
import { ACTIVATION_MODE_CHANGED, getActivationMode, setActivationMode, type ActivationMode } from '@/lib/activation-mode';
import type { ConciergeHandoff } from '@/lib/concierge-handoff';
import type { AIReasonerResult } from '@/lib/assistance-reasoner';

function Signal({label,value}:{label:string,value:string}){return <div className="signalRow"><span>{label}</span><strong className={`signal ${value.toLowerCase()}`}>{value}</strong></div>}
function DecisionCard({label,decision}:{label:string,decision:AIReasonerResult['decision']}){return <div className={`panel decisionPanel decision-${decision.decision.toLowerCase()}`}><div className="eyebrow">{label}</div><div className="decisionHero"><div><span className="decisionLabel">Decision</span><strong className="decisionValue">{decision.decision}</strong></div><div><span className="decisionLabel">Confidence</span><strong className="decisionConfidence">{Math.round(decision.confidence*100)}%</strong></div></div><h2>{decision.headline}</h2><p className="decisionReason">{decision.reason}</p><div className="decisionMeta"><div><span>Assistance type</span><strong>{decision.assistanceType.replaceAll('_',' ')}</strong></div><div><span>Evidence</span><ul>{decision.evidence.map((x,i)=><li key={i}>{x}</li>)}</ul></div></div></div>}

function ActivationTrace({events,decision,policy}:{events:WanderlyEvent[];decision:ReturnType<typeof decideAssistance>;policy:ReturnType<typeof evaluatePolicy>}){
 const lifecycle=events.filter(e=>e.eventType.startsWith('ASSISTANCE_'));
 const status=lifecycle.filter(e=>e.eventType!=='ASSISTANCE_PREFERENCE').at(-1)?.eventType;
 const outcomes=summariseOutcomes(events);
 const handoff=[...lifecycle].reverse().map(e=>e.metadata?.handoff as ConciergeHandoff|undefined).find(Boolean);
 const stage=status==='ASSISTANCE_SHOWN'?'Balloon visible':status==='ASSISTANCE_ACCEPTED'?'Accepted — concierge opened':status==='ASSISTANCE_DISMISSED'?'Dismissed':'No invitation yet';
 const [mode,setMode]=useState<ActivationMode>('rules');
 useEffect(()=>{const sync=()=>setMode(getActivationMode());sync();window.addEventListener(ACTIVATION_MODE_CHANGED,sync);return()=>window.removeEventListener(ACTIVATION_MODE_CHANGED,sync)},[]);
 return <div className="panel"><div className="traceHead"><div className="eyebrow">Concierge activation trace</div><div className="modeToggle" role="group" aria-label="Activation source"><button className={mode==='rules'?'active':''} onClick={()=>setActivationMode('rules')}>Rules</button><button className={mode==='ai'?'active':''} onClick={()=>setActivationMode('ai')}>AI-assisted</button></div></div>
  <div className="traceSteps">
   <div><span>1 · Decision</span><strong>{decision.decision}{decision.assistanceType!=='NONE'?` · ${decision.assistanceType.replaceAll('_',' ')}`:''}</strong></div>
   <div><span>2 · Policy gate</span><strong className={policy.allowed?'traceAllowed':'traceBlocked'}>{policy.allowed?'ALLOWED':'BLOCKED'} · {policy.rule}</strong><small>{policy.reason}</small></div>
   <div><span>3 · Invitation</span><strong>{stage}</strong></div>
  </div>
  {lifecycle.length>0&&<div className="journeyChips">{lifecycle.map(e=><span key={e.id}>{new Date(e.timestamp).toLocaleTimeString()} · {e.eventType.replace('ASSISTANCE_','')}{e.metadata?.source?` · ${String(e.metadata.source)}`:''}{e.metadata?.reason?` (${String(e.metadata.reason)})`:''}</span>)}</div>}
  <div className="eyebrow" style={{marginTop:16}}>Invitation outcomes</div>
  {outcomes.length?<div className="journeyChips">{outcomes.map((o,i)=><span key={i}>{o.assistanceType.replaceAll('_',' ')} · {o.response.replace('_',' ')}{o.priority?` · priority ${o.priority}`:''} · {o.progressedAfter?'progressed after':'no progression yet'}</span>)}</div>:<p className="muted">No invitations in this session.</p>}
  <div className="eyebrow" style={{marginTop:16}}>Handoff payload sent to the concierge</div>
  {handoff?<pre className="handoffJson">{JSON.stringify(handoff,null,2)}</pre>:<p className="muted">No handoff yet. A payload is created when an invitation is shown.</p>}
 </div>
}

export default function AgentPage(){
 const [events,setEvents]=useState<WanderlyEvent[]>([]); const [sid,setSid]=useState('');
 const [ai,setAi]=useState<AIReasonerResult|null>(null); const [aiError,setAiError]=useState(''); const [aiLoading,setAiLoading]=useState(false);
 const refresh=()=>{const s=getLatestSessionId();setSid(s);setEvents(getEvents().filter(e=>e.sessionId===s))};
 useEffect(()=>{refresh();window.addEventListener(EVENT_UPDATED,refresh);window.addEventListener('storage',refresh);const t=setInterval(refresh,800);return()=>{window.removeEventListener(EVENT_UPDATED,refresh);window.removeEventListener('storage',refresh);clearInterval(t)}},[]);
 const semantic=useMemo(()=>events.filter(e=>e.eventType!=='PAGE_VIEW'&&e.eventType!=='SESSION_START'&&!e.eventType.startsWith('ASSISTANCE_')),[events]);
 const context=useMemo(()=>buildJourneyContext(events),[events]);
 const decision=useMemo(()=>decideAssistance(context),[context]);
 const policy=useMemo(()=>evaluatePolicy(decision,context,events),[decision,context,events]);
 const contextKey=useMemo(()=>JSON.stringify(context),[context]);
 useEffect(()=>{const controller=new AbortController();setAiLoading(true);setAiError('');fetch('/api/assistance/reason',{method:'POST',headers:{'content-type':'application/json'},body:contextKey,signal:controller.signal}).then(async response=>{const body=await response.json() as {error?:string}&Partial<AIReasonerResult>;if(!response.ok)throw new Error(body.error||'AI reasoner request failed.');setAi(body as AIReasonerResult)}).catch(error=>{if(error instanceof DOMException&&error.name==='AbortError')return;setAi(null);setAiError(error instanceof Error?error.message:'AI reasoner request failed.')}).finally(()=>{if(!controller.signal.aborted)setAiLoading(false)});return()=>controller.abort()},[contextKey]);
 return <main className="shell"><section className="section topspace"><div className="agentTop"><div><div className="eyebrow">Internal · Journey Inspector</div><h1 className="display">Live Wanderly session.</h1><p className="muted">Step 3 has started: the normalized journey context now feeds an explainable assistance decision engine that chooses SILENT, WAIT, or ASSIST.</p></div><div className="agentActions"><Link className="btn" href="/">Open Wanderly</Link><Link className="btn ghost" href="/demo">Demo scenarios</Link><button className="btn ghost" onClick={()=>{clearCurrentSession(sid);refresh()}}>New session</button></div></div>
 <div className="agentGrid"><div className="panel"><div className="eyebrow">Session</div><code className="sessionCode">{sid||'starting...'}</code><div className="metricRow"><div><strong>{events.length}</strong><span>events</span></div><div><strong>{semantic.length}</strong><span>journey signals</span></div></div></div><div className="panel"><div className="eyebrow">Phase B status</div><h2>Baseline + AI comparison</h2><p className="muted">The rule baseline and provider-backed AI reasoner are shown independently. There is no final execution policy in this phase.</p></div></div>
 <div className="panel contextPanel"><div className="eyebrow">Interpreted journey state</div><div className="contextColumns"><div><Signal label="Destination switching" value={context.destinationSwitching}/><Signal label="Comparison activity" value={context.comparisonActivity}/><Signal label="Pricing exploration" value={context.pricingExploration}/><Signal label="Information seeking" value={context.informationSeeking}/><Signal label="Booking progression" value={context.bookingProgression}/></div><div className="contextSummary"><span className="contextLabel">Destinations viewed</span><strong>{context.destinationsViewed.join(', ')||'None yet'}</strong><span className="contextLabel">Journey progression</span><strong className={`progress ${context.journeyProgression.toLowerCase()}`}>{context.journeyProgression}</strong><span className="contextLabel">Potential friction</span><strong>{context.potentialFriction.replaceAll('_',' ')}</strong></div></div></div>
 <div className="comparisonGrid"><DecisionCard label="Rule baseline" decision={decision}/>{ai?<div><DecisionCard label="AI reasoner" decision={ai.decision}/><div className="reasonerMeta"><strong>{ai.mode.toUpperCase()}</strong><span>Provider: {ai.provider.name} · Model: {ai.provider.model}</span></div></div>:<div className="panel decisionPanel"><div className="eyebrow">AI reasoner</div><h2>{aiLoading?'Reasoning…':'Unavailable'}</h2><p className="muted">{aiError||'Waiting for the server-side reasoner.'}</p></div>}</div>
 <ActivationTrace events={events} decision={decision} policy={policy}/>
 <div className="panel"><div className="eyebrow">Recent semantic journey</div>{context.recentJourney.length?<div className="journeyChips">{context.recentJourney.map((x,i)=><span key={`${x}-${i}`}>{x}</span>)}</div>:<p className="muted">Start browsing to build a journey.</p>}</div>
 <div className="panel timelinePanel"><div className="eyebrow">Raw event timeline</div>{events.length===0?<p className="muted">No events yet. Open Wanderly and start browsing.</p>:<div className="timeline">{[...events].reverse().map(e=><div className="timelineItem" key={e.id}><time>{new Date(e.timestamp).toLocaleTimeString()}</time><strong>{e.eventType}</strong><span>{e.entity||e.page}</span></div>)}</div>}</div>
 </section></main>
}
