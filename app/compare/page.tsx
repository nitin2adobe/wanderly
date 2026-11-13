'use client';
import Link from 'next/link';
import { track } from '@/lib/tracking';
import DestinationComparison, { useDestinationComparison } from '@/components/DestinationComparison';

export default function Page() {
	const { selected } = useDestinationComparison();

	return <main className="shell"><section className="section topspace">
		<div className="eyebrow">Compare</div>
		<h1 className="display">Compare destinations.</h1>
		<Link className="btn ghost" href="/destinations">Browse destinations</Link>
		<div className="compare" style={{ marginTop: 35 }}>{selected.map(destination =>
			<article className="card" key={destination.slug}>
				<div className="photo" style={{ backgroundImage: `url(${destination.image})` }}/>
				<div className="cardBody">
					<h3>{destination.name}</h3><p className="muted">{destination.description}</p>
					<div className="tags">{destination.vibe.map(vibe => <span className="tag" key={vibe}>{vibe}</span>)}</div>
					<DestinationComparison slug={destination.slug}/>
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
					<tr><th scope="row">From</th>{selected.map(destination => <td key={destination.slug}>{destination.from}</td>)}</tr>
				</tbody>
			</table></div> : <p className="muted" role="status">No destinations selected.</p>}
			<div style={{ marginTop: 25 }}><Link href="/booking" className="btn" onClick={() => track('DATE_SEARCH', window.location.pathname)}>Check dates</Link></div>
		</div>
	</section></main>;
}
