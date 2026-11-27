'use client';

import { useEffect, useState } from 'react';
import { AAA_TRACE_CHANGED, acceptFrameActivationTrace, getActivationTraces, type ActivationTraceEntry } from '@/lib/aaa-activation';

export default function AaaStarterTrace({ sessionId }: { sessionId: string }) {
  const [entries, setEntries] = useState<ActivationTraceEntry[]>([]);
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event && 'detail' in event) acceptFrameActivationTrace(event.detail);
      setEntries(getActivationTraces(sessionId));
    };
    sync();
    window.addEventListener(AAA_TRACE_CHANGED, sync);
    return () => window.removeEventListener(AAA_TRACE_CHANGED, sync);
  }, [sessionId]);
  return <section className="aaaStarterTrace" aria-labelledby="aaa-starter-trace-title">
    <h3 id="aaa-starter-trace-title">AAA starter trace</h3>
    <p className="muted">Reason codes only, in this tab. Tool arguments, generated questions and page content are not included. Opening chat is not submitting a question.</p>
    {entries.length ? <ol>{entries.map((entry, index) => {
      const traceId = entry.traceId;
      return <li key={`${entry.at}-${index}`}>
      <strong>{entry.phase}</strong> <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleTimeString()}</time>
      <dl>
        {Object.entries(entry.trace).filter(([, values]) => values.length > 0).map(([field, values]) => <div key={field}>
          <dt>{({ reasonCodes: 'Reasons', tools: 'Tools', alternatives: 'Alternatives', validatorVerdicts: 'Validator', fallbackReasons: 'Fallback', suppressionReasons: 'Suppression' } as Record<string, string>)[field]}</dt>
          <dd>{values.map(code => <code key={code}>{code}</code>)}</dd>
        </div>)}
      </dl>
      {traceId && <p>Service trace: <code>{traceId}</code></p>}
    </li>;
    })}</ol> : <p className="muted">No starter generation in this tab yet. AAA stays quiet until the canonical policy allows assistance.</p>}
  </section>;
}
