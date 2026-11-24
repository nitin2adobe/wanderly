'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import PackageCard from '@/components/PackageCard';
import { destinations, filterPackages, getDestination } from '@/lib/data';

export default function PackageExplorer() {
  const selections = useSearchParams().getAll('destination');
  const destination = selections.length === 1 ? selections[0] : 'all';
  const pathname = usePathname();
  const router = useRouter();
  const setDestination = (slug: string) => {
    const params = new URLSearchParams(window.location.search);
    if (slug === 'all') params.delete('destination');
    else params.set('destination', slug);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [pace, setPace] = useState('All');
  const [maxPrice, setMaxPrice] = useState(5000);
  if (destination !== 'all' && !getDestination(destination)) return <div className="notice" role="alert">That destination is not in our sample catalog. <Link href="/packages">Browse all packages</Link></div>;
  const visible = filterPackages(destination, pace, maxPrice);
  return <div>
    <div className="contentFilters">
      <div className="field"><label htmlFor="package-destination">Destination</label><select id="package-destination" value={destination} onChange={event => setDestination(event.target.value)}><option value="all">All destinations</option>{destinations.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div>
      <div className="field"><label htmlFor="package-pace">Trip pace</label><select id="package-pace" value={pace} onChange={event => setPace(event.target.value)}>{['All', 'Relaxed', 'Balanced', 'Active'].map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="field"><label htmlFor="package-budget">Sample budget per person</label><select id="package-budget" value={maxPrice} onChange={event => setMaxPrice(Number(event.target.value))}><option value={5000}>Any sample budget</option><option value={2200}>Up to $2,200</option><option value={3000}>Up to $3,000</option><option value={4000}>Up to $4,000</option></select></div>
    </div>
    <p className="muted" role="status">{visible.length} journey{visible.length === 1 ? '' : 's'} matching your choices</p>
    {visible.length ? <div className="grid">{visible.map(pack => <PackageCard key={pack.id} pack={pack}/>)}</div> :
      <div className="notice">No packages match these choices. <button className="btn ghost" type="button" onClick={() => { setDestination('all'); setPace('All'); setMaxPrice(5000); }}>Clear filters</button></div>}
  </div>;
}
