'use client';
import Link from 'next/link';
import { track } from '@/lib/tracking';
import DestinationComparison, { useDestinationComparison } from '@/components/DestinationComparison';

export default function Page() {
	const { selected } = useDestinationComparison();

	return <main className="shell"><section className="section topspace">
		<div className="eyebrow">Compare</div>
		<h1 className="display">Compare destinations.</h1>
		<p className="muted contentIntro">Compare the day-to-day experience, not just the postcard. Add destinations from their detail pages, then explore the one that fits your priorities.</p>
		<Link className="btn ghost" href="/destinations">Browse destinations</Link>
		<div className="compare" style={{ marginTop: 35 }}>{selected.map(destination =>
			<article className="card" key={destination.slug}>
				<div className="photo" style={{ backgroundImage: `url(${destination.image})` }}/>
				<div className="cardBody">
					<h3>{destination.name}</h3><p className="muted">{destination.description}</p>
					<div className="tags">{destination.vibe.map(vibe => <span className="tag" key={vibe}>{vibe}</span>)}</div>
					<DestinationComparison slug={destination.slug}/>
					<p><Link href={`/destinations/${destination.slug}`}>Explore {destination.name} in detail</Link></p>
				</div>
			</article>
		)}</div>
		<div className="section">
			{selected.length ? <div style={{ overflowX: 'auto' }}><table className="table">
				<thead><tr><th scope="col">Destination</th>{selected.map(destination => <th scope="col" key={destination.slug}>{destination.name}</th>)}</tr></thead>
				<tbody>
					<tr><th scope="row">Best for</th>{selected.map(destination => <td key={destination.slug}>{destination.vibe.join(' + ')}</td>)}</tr>
					<tr><th scope="row">Trip rhythm</th>{selected.map(destination => <td key={destination.slug}>{destination.tagline}</td>)}</tr>
					<tr><th scope="row">Suggested stay</th>{selected.map(destination => <td key={destination.slug}>{destination.days}</td>)}</tr>
					<tr><th scope="row">Illustrative starting price</th>{selected.map(destination => <td key={destination.slug}>{destination.from} per person</td>)}</tr>
					<tr><th scope="row">Who it suits</th>{selected.map(destination => <td key={destination.slug}>{destination.bestFor}</td>)}</tr>
					<tr><th scope="row">The trade-off</th>{selected.map(destination => <td key={destination.slug}>{destination.tradeoff}</td>)}</tr>
					<tr><th scope="row">Getting around</th>{selected.map(destination => <td key={destination.slug}>{destination.gettingAround}</td>)}</tr>
					<tr><th scope="row">Stay styles</th>{selected.map(destination => <td key={destination.slug}>{destination.stayStyles.map(stay => stay.name).join(' / ')}</td>)}</tr>
					<tr><th scope="row">Next step</th>{selected.map(destination => <td key={destination.slug}><Link className="btn ghost" href={`/packages?destination=${destination.slug}`}>View {destination.name} packages</Link></td>)}</tr>
				</tbody>
			</table></div> : <div className="notice" role="status">No destinations selected. Open a destination and choose &quot;Add to comparison&quot; to build your shortlist.</div>}
			{selected.length > 0 && <div className="contentActions" style={{ marginTop: 25 }}>{selected.map(destination => <Link key={destination.slug} href={`/booking?destination=${destination.slug}`} className="btn" onClick={() => track('DATE_SEARCH', window.location.pathname, destination.slug)}>Check {destination.name} dates</Link>)}</div>}
			<p className="muted">Prices and stay descriptions are illustrative, not live quotes. Seasonal conditions and entry requirements must be verified for your dates.</p>
		</div>
	</section></main>;
}
