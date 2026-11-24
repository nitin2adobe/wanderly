import Link from 'next/link';
import type { TravelPackage } from '@/lib/data';

export default function PackageCard({ pack }: { pack: TravelPackage }) {
  return <article className="card">
    <div className="photo" style={{ backgroundImage: `url(${pack.image})` }}/>
    <div className="cardBody">
      <div className="eyebrow">{pack.name} / {pack.pace}</div>
      <h3>{pack.packageName}</h3>
      <p className="muted">{pack.summary}</p>
      <div className="tags"><span className="tag">{pack.days}</span><span className="tag">{pack.pace} pace</span></div>
      <p className="muted">{pack.stay}</p>
      <p><strong>{pack.price}</strong> <span className="muted">sample price per person</span></p>
      <Link href={`/packages/${pack.id}`}>Explore {pack.packageName} itinerary</Link>
    </div>
  </article>;
}
