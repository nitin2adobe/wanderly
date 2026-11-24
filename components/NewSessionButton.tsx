'use client';

import { useState } from 'react';
import { resetDestinationComparison } from '@/components/DestinationComparison';
import { CONCIERGE_CLOSE_EVENT } from '@/lib/concierge-connector';
import { clearCurrentSession, getSessionId, track } from '@/lib/tracking';

export default function NewSessionButton() {
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const startSession = () => {
    try {
      window.dispatchEvent(new Event(CONCIERGE_CLOSE_EVENT));
      clearCurrentSession(getSessionId());
      resetDestinationComparison();
      track('SESSION_START', window.location.pathname);
      track('PAGE_VIEW', window.location.pathname);
      setResult({ text: 'New browsing session started. Adobe chat history is unchanged.', error: false });
    } catch (error) {
      console.error('Unable to start a new Wanderly session:', error);
      setResult({ text: 'The session could not be fully reset. Reload the page and try again.', error: true });
    }
  };

  return <>
    <button type="button" className="btn secondary" onClick={startSession} title="Clear this session's browsing history and comparison without deleting Adobe chat history">New session</button>
    {result && <span role={result.error ? 'alert' : 'status'}>{result.text}</span>}
  </>;
}
