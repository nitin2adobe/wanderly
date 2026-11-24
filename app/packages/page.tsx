import { Suspense } from 'react';
import PackageExplorer from '@/components/PackageExplorer';

export default function Page() {
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Curated packages</div><h1 className="display">The planning is done.<br/>The trip is still yours.</h1>
    <p className="muted contentIntro">Twelve sample journeys, six destinations and different ways to spend your days. Compare pacing and inclusions before choosing dates.</p>
    <Suspense fallback={<p className="muted" role="status">Loading packages...</p>}><PackageExplorer/></Suspense>
    <div className="notice contentDisclaimer">Prices are illustrative per person, based on two adults sharing. International flights, insurance and unlisted extras are excluded. No live inventory is checked.</div>
  </section></main>;
}
