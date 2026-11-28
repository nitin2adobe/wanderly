import { Suspense } from 'react';
import DestinationExplorer from '@/components/DestinationExplorer';

export default function Page() {
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Destinations</div><h1 className="display">Choose a different rhythm.</h1>
    <p className="muted contentIntro">From private-island stillness to food-led cities and mountain railways, find a place that suits the way you want to spend your days.</p>
    <Suspense fallback={<p className="muted" role="status">Loading destinations...</p>}><DestinationExplorer/></Suspense>
    <div className="notice contentDisclaimer">Prices are per person and confirmed at booking. Check entry requirements with official sources.</div>
  </section></main>;
}
