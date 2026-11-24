import Link from 'next/link';
import TravelInfo from '@/components/TravelInfo';
import { getDestination } from '@/lib/data';

export default async function Page({ searchParams }: { searchParams: Promise<{ destination?: string | string[] }> }) {
  const query = await searchParams;
  const destination = typeof query.destination === 'string' ? query.destination : 'japan';
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Travel info</div><h1 className="display">Good trips start with<br/>clear answers.</h1>
    <p className="muted contentIntro">Understand the practical choices behind the itinerary: transfers, luggage, stay suitability and the questions to settle before paying.</p>
    {getDestination(destination) ? <TravelInfo initialDestination={destination}/> : <div className="notice" role="alert">That destination is not in our catalog. <Link href="/travel-info">Browse practical answers</Link></div>}
    <div className="notice contentDisclaimer">Illustrative planning information only, not current entry, medical, insurance or legal advice. Verify official government guidance and the actual provider's terms before real travel.</div>
  </section></main>;
}
