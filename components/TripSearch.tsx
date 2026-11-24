'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TripSearch() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  return <form className="search" onSubmit={event => { event.preventDefault(); router.push(`/destinations?search=${encodeURIComponent(search.trim())}`); }}>
    <label className="srOnly" htmlFor="home-trip-search">Search destinations or experiences</label>
    <input id="home-trip-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try food, beach or scenic rail"/>
    <button type="submit" className="btn">Find a trip</button>
  </form>;
}
