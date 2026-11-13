'use client';
import { useSyncExternalStore } from 'react';
import { destinations } from '@/lib/data';
import { track } from '@/lib/tracking';

const comparisonKey = 'wanderly-comparison';
const comparisonUpdated = 'wanderly:comparison-updated';
let fallbackSnapshot = '[]';

function subscribe(listener: () => void) {
  window.addEventListener(comparisonUpdated, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(comparisonUpdated, listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot() {
  try { return sessionStorage.getItem(comparisonKey) || '[]'; }
  catch { return fallbackSnapshot; }
}

const getServerSnapshot = () => '[]';

function readSelection(snapshot: string) {
  try {
    const stored: unknown = JSON.parse(snapshot);
    return Array.isArray(stored) ? destinations.filter(destination => stored.includes(destination.slug)) : [];
  } catch { return []; }
}

export function useDestinationComparison() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected = readSelection(snapshot);

  function toggleComparison(slug: string) {
    if (!destinations.some(destination => destination.slug === slug)) return;
    const current = readSelection(getSnapshot()).map(destination => destination.slug);
    const removing = current.includes(slug);
    const next = removing ? current.filter(selectedSlug => selectedSlug !== slug) : [...current, slug];
    fallbackSnapshot = JSON.stringify(next);
    try { sessionStorage.setItem(comparisonKey, fallbackSnapshot); } catch {}
    window.dispatchEvent(new Event(comparisonUpdated));
    track(removing ? 'COMPARE_REMOVE' : 'COMPARE_ADD', window.location.pathname, slug);
  }

  return { selected, toggleComparison };
}

export default function DestinationComparison({ slug }: { slug: string }) {
  const { selected, toggleComparison } = useDestinationComparison();
  const included = selected.some(destination => destination.slug === slug);
  return <button className="btn ghost" type="button" aria-pressed={included} onClick={() => toggleComparison(slug)}>
    {included ? 'Remove from comparison' : 'Add to comparison'}
  </button>;
}