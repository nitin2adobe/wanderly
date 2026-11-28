'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EVENT_UPDATED, WanderlyEvent } from '@/lib/events';
import { clearCurrentSession, getCurrentJourney } from '@/lib/tracking';
import { buildJourneyContext } from '@/lib/journey-context';
import { decideAssistance } from '@/lib/assistance-decision';
import type { AIReasonerResult } from '@/lib/assistance-reasoner';
import { isAaaEnabled } from '@/lib/aaa-runtime';
import { useAaaAvailability } from '@/components/AaaConsent';
import AaaStarterTrace from '@/components/AaaStarterTrace';

function Signal({label,value}:{label:string,value:string}){return <div className="signalRow"><span>{label}</span><strong className={`signal ${value.toLowerCase()}`}>{value}</strong></div>}
function DecisionCard({label,decision}:{label:string,decision:AIReasonerResult['decision']}){return <div className={`panel decisionPanel decision-${decision.decision.toLowerCase()}`}><div className="eyebrow">{label}</div><div className="decisionHero"><div><span className="decisionLabel">Decision</span><strong className="decisionValue">{decision.decision}</strong></div><div><span className="decisionLabel">Confidence</span><strong className="decisionConfidence">{Math.round(decision.confidence*100)}%</strong></div></div><h2>{decision.headline}</h2><p className="decisionReason">{decision.reason}</p><div className="decisionMeta"><div><span>Assistance type</span><strong>{decision.assistanceType.replaceAll('_',' ')}</strong></div><div><span>Evidence</span><ul>{decision.evidence.map((x,i)=><li key={i}>{x}</li>)}</ul></div></div></div>}

export default function AgentPage(){
 const aaa=useAaaAvailability();
 const [events,setEvents]=useState<WanderlyEvent[]>([]); const [sid,setSid]=useState('');
 const [ai,setAi]=useState<AIReasonerResult|null>(null); const [aiError,setAiError]=useState(''); const [aiLoading,setAiLoading]=useState(false);
 const [showLegacy,setShowLegacy]=useState(false);
 const refresh=()=>{const j=getCurrentJourney();setSid(j.sessionId);setEvents(j.events)};
 useEffect(()=>{refresh();window.addEventListener(EVENT_UPDATED,refresh);window.addEventListener('storage',refresh);const t=setInterval(refresh,800);return()=>{window.removeEventListener(EVENT_UPDATED,refresh);window.removeEventListener('storage',refresh);clearInterval(t)}},[aaa.enabled]);
 const semantic=useMemo(()=>events.filter(e=>e.eventType!=='PAGE_VIEW'&&e.eventType!=='SESSION_START'),[events]);
 const context=useMemo(()=>buildJourneyContext(events),[events]);
 const decision=useMemo(()=>decideAssistance(context),[context]);
 const contextKey=useMemo(()=>JSON.stringify(context),[context]);
 useEffect(()=>{if(!showLegacy){setAi(null);setAiLoading(false);setAiError('');return}if(!aaa.enabled||!isAaaEnabled()){setAi(null);setAiLoading(false);setAiError(!aaa.enabled&&aaa.reason==='profile.unavailable'?'No valid Site Profile is active, so the AI reasoner is not called.':'Assistance consent has not been granted, so the AI reasoner is not called.');return}const controller=new AbortController();setAiLoading(true);setAiError('');fetch('/api/assistance/reason',{method:'POST',headers:{'content-type':'application/json'},body:contextKey,signal:controller.signal}).then(async response=>{const body=await response.json() as {error?:string}&Partial<AIReasonerResult>;if(!response.ok)throw new Error(body.error||'AI reasoner request failed.');if(isAaaEnabled())setAi(body as AIReasonerResult)}).catch(error=>{if(error instanceof DOMException&&error.name==='AbortError')return;setAi(null);setAiError(error instanceof Error?error.message:'AI reasoner request failed.')}).finally(()=>{if(!controller.signal.aborted)setAiLoading(false)});return()=>controller.abort()},[contextKey,aaa,showLegacy]);
 return <main className="shell"><section className="section topspace"><div className="agentTop"><div><h1 className="display">This tab&apos;s Wanderly session.</h1><p className="muted">Browse Wanderly in this tab and return to inspect its journey and client activation record. Service observability and marketer controls belong to the separate Adaptive Assistance Agent. Opening this inspector does not generate starters or request an AI comparison.</p>{!aaa.enabled&&<p className="muted" role="status">{aaa.reason==='profile.unavailable'?'No valid Site Profile is active, so no client journey is recorded or shown.':'No client journey is shown until demo assistance is enabled.'}</p>}</div><div className="agentActions"><Link className="btn" href="/">Open Wanderly</Link><button className="btn ghost" onClick={()=>{clearCurrentSession(sid);refresh()}}>New session</button></div></div>
 <h2 style={{fontSize:'1.5rem',fontFamily:'Arial, Helvetica, sans-serif'}}>Client activation in this tab</h2>
 <div className="panel"><AaaStarterTrace sessionId={sid}/></div>
 <details onToggle={event=>setShowLegacy(event.currentTarget.open)}>
 <summary style={{padding:'14px 0',cursor:'pointer'}}>Legacy journey comparison (opening this section requests the separate AI reasoner)</summary>
 {showLegacy&&<>
 <div className="agentGrid"><div className="panel"><div className="eyebrow">Session</div><code className="sessionCode">{sid||'starting...'}</code><div className="metricRow"><div><strong>{events.length}</strong><span>events</span></div><div><strong>{semantic.length}</strong><span>journey signals</span></div></div></div><div className="panel"><div className="eyebrow">Legacy comparison</div><h2>Baseline + AI comparison</h2><p className="muted">These legacy previews do not control AAA activation. The canonical Site Profile, journey and suppression policy gate the optional nudge; only a visitor action opens chat.</p></div></div>
 <div className="panel contextPanel"><div className="eyebrow">Interpreted journey state</div><div className="contextColumns"><div><Signal label="Destination switching" value={context.destinationSwitching}/><Signal label="Comparison activity" value={context.comparisonActivity}/><Signal label="Pricing exploration" value={context.pricingExploration}/><Signal label="Information seeking" value={context.informationSeeking}/><Signal label="Booking progression" value={context.bookingProgression}/></div><div className="contextSummary"><span className="contextLabel">Destinations viewed</span><strong>{context.destinationsViewed.join(', ')||'None yet'}</strong><span className="contextLabel">Journey progression</span><strong className={`progress ${context.journeyProgression.toLowerCase()}`}>{context.journeyProgression}</strong><span className="contextLabel">Potential friction</span><strong>{context.potentialFriction.replaceAll('_',' ')}</strong></div></div></div>
 <div className="comparisonGrid"><DecisionCard label="Rule baseline" decision={decision}/>{ai?<div><DecisionCard label="AI reasoner" decision={ai.decision}/><div className="reasonerMeta"><strong>{ai.mode.toUpperCase()}</strong><span>Provider: {ai.provider.name} · Model: {ai.provider.model}</span></div></div>:<div className="panel decisionPanel"><div className="eyebrow">AI reasoner</div><h2>{aiLoading?'Reasoning…':'Unavailable'}</h2><p className="muted">{aiError||'Waiting for the server-side reasoner.'}</p></div>}</div>
 <div className="panel"><div className="eyebrow">Recent semantic journey</div>{context.recentJourney.length?<div className="journeyChips">{context.recentJourney.map((x,i)=><span key={`${x}-${i}`}>{x}</span>)}</div>:<p className="muted">Start browsing to build a journey.</p>}</div>
 <div className="panel timelinePanel"><div className="eyebrow">Raw event timeline</div>{events.length===0?<p className="muted">No events yet. Open Wanderly and start browsing.</p>:<div className="timeline">{[...events].reverse().map(e=><div className="timelineItem" key={e.id}><time>{new Date(e.timestamp).toLocaleTimeString()}</time><strong>{e.eventType}</strong><span>{e.entity||e.page}</span></div>)}</div>}</div>
 </>}
 </details>
 </section></main>
}
