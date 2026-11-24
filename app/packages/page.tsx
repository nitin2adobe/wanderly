import Link from 'next/link';
import PackageExplorer from '@/components/PackageExplorer';
import { getDestination } from '@/lib/data';

export default async function Page({ searchParams }: { searchParams: Promise<{ destination?: string | string[] }> }) {
  const query = await searchParams;
  const destination = typeof query.destination === 'string' ? query.destination : 'all';
  const validSelection = destination === 'all' || !!getDestination(destination);
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Curated packages</div><h1 className="display">The planning is done.<br/>The trip is still yours.</h1>
    <p className="muted contentIntro">Twelve sample journeys, six destinations and different ways to spend your days. Compare pacing and inclusions before choosing dates.</p>
    {validSelection ? <PackageExplorer initialDestination={destination}/> : <div className="notice" role="alert">That destination is not in our sample catalog. <Link href="/packages">Browse all packages</Link></div>}
    <div className="notice contentDisclaimer">Prices are illustrative per person, based on two adults sharing. International flights, insurance and unlisted extras are excluded. No live inventory is checked.</div>
  </section></main>;
}
