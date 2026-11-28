import Link from 'next/link';
import { notFound } from 'next/navigation';
import PackageCard from '@/components/PackageCard';
import { TrackedDetails, TrackedLink } from '@/components/TrackedAction';
import { getPackage, getPackagesForDestination, packages } from '@/lib/data';

export function generateStaticParams() { return packages.map(pack => ({ slug: pack.id })); }

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pack = getPackage(slug);
  if (!pack || pack.id !== slug) notFound();
  const alternatives = getPackagesForDestination(pack.slug).filter(item => item.id !== pack.id);
  return <main className="shell">
    <p className="muted"><Link href={`/destinations/${pack.slug}`}>{pack.name}</Link> / {pack.packageName}</p>
    <section className="pageHero">
      <div className="copy"><div className="eyebrow">{pack.name} / sample itinerary</div><h1>{pack.packageName}</h1><p className="muted">{pack.summary}</p>
        <div className="facts"><div className="fact"><strong>{pack.days}</strong><span className="muted">Time to explore</span></div><div className="fact"><strong>{pack.price}</strong><span className="muted">Sample per person</span></div><div className="fact"><strong>{pack.pace}</strong><span className="muted">Daily pace</span></div></div>
        <p className="muted">{pack.stay}</p>
        <div className="contentActions"><TrackedLink className="btn" eventType="DATE_SEARCH" entity={pack.id} href={`/booking?package=${pack.id}`}>Check dates for this journey</TrackedLink><Link className="btn ghost" href={`/packages?destination=${pack.slug}`}>Compare other packages</Link></div>
      </div><div className="image" style={{ backgroundImage: `url(${pack.image})` }}/>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">How the trip feels</div><h2>A plan, not a stopwatch.</h2></div><p>This is a sample route outline, not a confirmed daily schedule. Hosted activities and free time can be adjusted in a real quote.</p></div>
      <ol className="itinerary">{pack.itinerary.map(stop => <li className="panel" key={stop.stage}><div className="eyebrow">{stop.stage}</div><h3>{stop.title}</h3><p className="muted">{stop.description}</p></li>)}</ol>
    </section>
    <section className="section">
      <div className="booking"><div className="panel"><h2 className="contentHeading">What the sample price covers</h2><ul className="list">{pack.included.map(item => <li key={item}>{item}</li>)}</ul>
        <TrackedDetails eventType="PRICE_VIEW" entity={pack.id} summary="What is not included?"><ul className="list">{pack.excluded.map(item => <li key={item}>{item}</li>)}</ul></TrackedDetails>
      </div><div className="panel"><h2 className="contentHeading">Before choosing dates</h2>
        <TrackedDetails eventType="HOTEL_VIEW" entity={pack.stay} summary="About the stay"><p>{pack.stay}. Exact properties and room types are confirmed in your quote.</p></TrackedDetails>
        <TrackedDetails eventType="FAQ_SEARCH" entity="package-date-changes" summary="Can this itinerary be changed?"><p>Change and cancellation terms are confirmed before payment.</p></TrackedDetails>
        <p className="muted">{pack.tradeoff}</p><Link className="btn ghost" href={`/travel-info?destination=${pack.slug}`}>Travel questions for {pack.name}</Link>
      </div></div>
    </section>
    <section className="section"><div className="sectionHead"><h2>Another way to see {pack.name}.</h2><p>Different nights, pacing and stay choices. Explore the alternative before deciding.</p></div><div className="compare">{alternatives.map(item => <PackageCard key={item.id} pack={item}/>)}</div></section>
    <div className="notice contentDisclaimer">Prices are per person, based on two adults sharing, and confirmed at booking. Flights, insurance and unlisted extras are excluded.</div>
  </main>;
}
