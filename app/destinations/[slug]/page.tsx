import Link from 'next/link';
import { notFound } from 'next/navigation';
import DestinationComparison from '@/components/DestinationComparison';
import PackageCard from '@/components/PackageCard';
import { TrackedDetails, TrackedLink } from '@/components/TrackedAction';
import { destinations, getDestination, getPackagesForDestination } from '@/lib/data';

export function generateStaticParams() { return destinations.map(destination => ({ slug: destination.slug })); }

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = getDestination(slug);
  if (!destination) notFound();
  const choices = getPackagesForDestination(slug);
  return <main className="shell">
    <section className="pageHero">
      <div className="copy">
        <div className="eyebrow">{destination.country}</div><h1>{destination.name}</h1><p className="muted">{destination.description}</p>
        <div className="facts"><div className="fact"><strong>{destination.days}</strong><span className="muted">Suggested stay</span></div><div className="fact"><strong>From {destination.from}</strong><span className="muted">Illustrative per person</span></div><div className="fact"><strong>{destination.vibe[0]}</strong><span className="muted">Signature mood</span></div></div>
        <div className="contentActions"><TrackedLink className="btn" href={`/booking?destination=${slug}`} eventType="DATE_SEARCH" entity={slug}>Check dates</TrackedLink><DestinationComparison slug={slug}/><Link className="btn ghost" href="/compare">View comparison</Link></div>
      </div>
      <div className="image" style={{ backgroundImage: `url(${destination.image})` }}/>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">Is this your kind of trip?</div><h2>The fit, and the trade-off.</h2></div><p>{destination.bestFor}</p></div>
      <div className="contentGrid">
        <div className="panel"><h3>Worth the journey</h3><ul className="list">{destination.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}</ul></div>
        <div className="panel"><h3>Know before choosing</h3><p className="muted">{destination.tradeoff}</p><h4>Getting around</h4><p className="muted">{destination.gettingAround}</p></div>
        <div className="panel"><h3>Plan with flexibility</h3><p className="muted">{destination.season}</p><Link className="btn ghost" href={`/travel-info?destination=${slug}`}>Practical answers for {destination.name}</Link></div>
      </div>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">A place to unpack</div><h2>Choose your base thoughtfully.</h2></div><p>Open a stay style to see the questions worth asking. These are fictional stay categories, not hotel listings or available rooms.</p></div>
      <div className="booking"><div className="panel">{destination.stayStyles.map(stay => <TrackedDetails key={stay.name} eventType="HOTEL_VIEW" entity={stay.name} summary={stay.name}><p>{stay.description}</p></TrackedDetails>)}</div><div className="panel"><h3>Small details, better days</h3><ul className="list">{destination.practicalNotes.map(note => <li key={note}>{note}</li>)}</ul></div></div>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">Two ways to go</div><h2>Same destination.<br/>A different daily rhythm.</h2></div><p>Look beyond the headline price: compare nights, stays, meals and free time. International flights are excluded from these sample prices.</p></div>
      <div className="compare">{choices.map(pack => <PackageCard key={pack.id} pack={pack}/>)}</div>
      <p><Link className="btn ghost" href={`/packages?destination=${slug}`}>Filter {destination.name} journeys</Link></p>
    </section>
    <div className="notice contentDisclaimer">Fictional travel content and sample prices only. Nothing on this page guarantees weather, room availability, entry eligibility or a final quote.</div>
  </main>;
}
