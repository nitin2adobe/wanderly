import { Suspense } from 'react';
import TravelInfo from '@/components/TravelInfo';

export default function Page() {
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Travel info</div><h1 className="display">Good trips start with<br/>clear answers.</h1>
    <p className="muted contentIntro">Understand the practical choices behind the itinerary: transfers, luggage, stay suitability and the questions to settle before paying.</p>
    <Suspense fallback={<p className="muted" role="status">Loading practical answers...</p>}><TravelInfo/></Suspense>
    <div className="notice contentDisclaimer">Always confirm entry, health and insurance requirements with official sources.</div>
  </section></main>;
}
