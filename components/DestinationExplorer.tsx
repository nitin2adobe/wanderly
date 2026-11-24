'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DestinationCard from '@/components/DestinationCard';
import { destinations, filterDestinations } from '@/lib/data';

const moods = ['All', ...new Set(destinations.flatMap(destination => destination.vibe))];

export default function DestinationExplorer() {
  const searches = useSearchParams().getAll('search');
  const search = searches.length === 1 ? searches[0] : '';
  return <DestinationFilters key={search} initialSearch={search}/>;
}

function DestinationFilters({ initialSearch }: { initialSearch: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [mood, setMood] = useState('All');
  const visible = filterDestinations(search, mood);
  return <div>
    <div className="contentFilters">
      <div className="field"><label htmlFor="destination-search">Search places, experiences or travel moods</label><input id="destination-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try food, beach, Japan or rail"/></div>
      <div className="field"><label htmlFor="destination-mood">Travel mood</label><select id="destination-mood" value={mood} onChange={event => setMood(event.target.value)}>{moods.map(value => <option key={value}>{value}</option>)}</select></div>
    </div>
    <p className="muted" role="status">{visible.length} destination{visible.length === 1 ? '' : 's'} to explore</p>
    {visible.length ? <div className="grid">{visible.map(destination => <DestinationCard key={destination.slug} d={destination}/>)}</div> :
      <div className="notice">No destinations match these choices. <button type="button" className="btn ghost" onClick={() => { setSearch(''); setMood('All'); }}>Clear filters</button></div>}
  </div>;
}
