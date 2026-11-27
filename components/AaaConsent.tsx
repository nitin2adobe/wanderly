'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getConsentAuthority, getDemoConsentAuthority, type ConsentState } from '@/lib/aaa-consent';
import { purgeJourneyHistory } from '@/lib/tracking';
import { AAA_UNAVAILABLE, getAaaRuntime } from '@/lib/aaa-runtime';
import type { AaaAvailability } from '@/aaa/profile/gate';

const subscribe = (listener: () => void) => getConsentAuthority().subscribe(listener);
const snapshot = () => getConsentAuthority().get();
const serverSnapshot = (): ConsentState => 'pending';

export function useAaaConsent(): ConsentState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

const subscribeAvailability = (listener: () => void) => getAaaRuntime().subscribe(listener);
const availabilitySnapshot = () => getAaaRuntime().get();
const serverAvailability = () => AAA_UNAVAILABLE;

/** Consent plus an active, valid Site Profile. */
export function useAaaAvailability(): AaaAvailability {
  return useSyncExternalStore(subscribeAvailability, availabilitySnapshot, serverAvailability);
}

export const AAA_DISCLOSURE = [
  'With your permission, Wanderly records which pages, destinations and packages you view, and which assistance you accept or dismiss, to suggest relevant help. It does not record what you type, your searches, form entries or account details.',
  'This activity is kept in this browser tab and expires after at most 30 minutes of inactivity. Duplicating or restoring a tab may copy its data. It is removed when the site next checks it while the tab is open, when you decline, or when your browser discards the tab’s storage after the tab is closed.',
  'When AI suggestions are switched on, a summary of this activity is sent to an AI model to choose a suggestion. When you chat, Brand Concierge may also receive a brief summary of your browsing intent, the page address and approved catalog details. Their retention follows Adobe’s and the model provider’s own policies.',
] as const;

/**
 * Demo stand-in for a consent management platform. Shown only when the host
 * has not provided its own consent authority.
 */
export default function AaaConsent() {
  const state = useAaaConsent();
  const availability = useAaaAvailability();
  const [demo, setDemo] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => { setDemo(!!getDemoConsentAuthority()); }, []);
  useEffect(() => {
    if (state === 'denied') purgeJourneyHistory();
  }, [state]);

  if (!demo) return null;
  const decide = (choice: 'granted' | 'denied') => {
    getDemoConsentAuthority()?.decide(choice);
    setReviewing(false);
  };
  if (state !== 'pending' && !reviewing) {
    return <button type="button" className="aaaConsentReopen" onClick={() => setReviewing(true)}>Assistance privacy: {state === 'granted' ? (availability.enabled ? 'on' : 'on · assistance unavailable') : 'off'}</button>;
  }
  return (
    <section className="aaaConsent" role="region" aria-label="Personalised assistance consent">
      <strong>Personalised travel assistance</strong>
      {AAA_DISCLOSURE.map(text => <p key={text}>{text}</p>)}
      <p className="muted">Demo consent banner: on a live site, the site’s own consent manager makes this choice.</p>
      <div className="aaaConsentActions">
        <button type="button" className="btn" onClick={() => decide('granted')}>Allow assistance</button>
        <button type="button" className="btn ghost" onClick={() => decide('denied')}>Decline</button>
      </div>
    </section>
  );
}
