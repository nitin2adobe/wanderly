import Link from 'next/link';
import BookingPlanner from '@/components/BookingPlanner';
import { getBookingSelection } from '@/lib/data';

export default async function Page({ searchParams }: { searchParams: Promise<{ destination?: string | string[]; package?: string | string[] }> }) {
  const query = await searchParams;
  const destination = typeof query.destination === 'string' ? query.destination : undefined;
  const packageId = typeof query.package === 'string' ? query.package : undefined;
  const selection = getBookingSelection(destination, packageId);
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Plan your trip</div><h1 className="display">One step closer.</h1>
    <p className="muted contentIntro">Choose your preferences, review the outline and prepare a local demo request. There is no live availability search, reservation or payment.</p>
    {selection ? <BookingPlanner key={`${selection.destination.slug}-${selection.pack?.id ?? ''}`} initialDestination={selection.destination.slug} initialPackage={selection.pack?.id}/> :
      <div className="notice" role="alert">This trip selection is unavailable or the package does not match the destination. <Link href="/packages">Choose a journey from the catalog</Link>.</div>}
  </section></main>;
}
