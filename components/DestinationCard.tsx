import Link from 'next/link';
import type { Destination } from '@/lib/data';

export default function DestinationCard({ d }: { d: Destination }) {
  return <article className="card">
    <div className="photo" style={{ backgroundImage: `url(${d.image})` }}/>
    <div className="cardBody">
      <div className="eyebrow">{d.country}</div>
      <h3>{d.name}</h3>
      <p className="muted">{d.tagline}</p>
      <div className="tags">{d.vibe.map(value => <span className="tag" key={value}>{value}</span>)}</div>
      <p className="muted">{d.days} suggested / from {d.from} per person, illustrative</p>
      <Link href={`/destinations/${d.slug}`}>Explore {d.name}</Link>
    </div>
  </article>;
}
