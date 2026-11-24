'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TrackedDetails } from '@/components/TrackedAction';
import { destinations } from '@/lib/data';
import { travelFaqs } from '@/lib/travel-info';

export default function TravelInfo() {
  const selections = useSearchParams().getAll('destination');
  const destinationSlug = selections.length === 1 ? selections[0] : 'japan';
  const pathname = usePathname();
  const router = useRouter();
  const setDestinationSlug = (slug: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('destination', slug);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [search, setSearch] = useState('');
  const destination = destinations.find(item => item.slug === destinationSlug);
  if (!destination) return <div className="notice" role="alert">That destination is not in our catalog. <Link href="/travel-info">Browse practical answers</Link></div>;
  const query = search.trim().toLowerCase();
  const faqs = travelFaqs(destination).filter(faq => `${faq.question} ${faq.answer}`.toLowerCase().includes(query));
  return <div>
    <div className="contentFilters">
      <div className="field"><label htmlFor="info-destination">Destination</label><select id="info-destination" value={destinationSlug} onChange={event => setDestinationSlug(event.target.value)}>{destinations.map(item => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></div>
      <div className="field"><label htmlFor="faq-search">Find an answer</label><input id="faq-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try luggage, transfers or insurance"/></div>
    </div>
    <div className="booking">
      <aside className="panel"><div className="eyebrow">Practical planning / {destination.name}</div><h2 className="contentHeading">Less guessing, better days.</h2><p className="muted">{destination.gettingAround}</p><ul className="list">{destination.practicalNotes.map(note => <li key={note}>{note}</li>)}</ul><div className="contentActions"><Link className="btn ghost" href={`/destinations/${destination.slug}`}>Explore {destination.name}</Link><Link className="btn ghost" href={`/packages?destination=${destination.slug}`}>View journeys</Link></div></aside>
      <div className="panel"><h2 className="contentHeading">Frequently asked</h2><p className="muted" role="status">{faqs.length} answer{faqs.length === 1 ? '' : 's'} for {destination.name}</p>
        {faqs.length ? faqs.map(faq => <TrackedDetails key={`${destination.slug}-${faq.id}`} eventType="FAQ_SEARCH" entity={`${destination.slug}-${faq.id}`} summary={faq.question}><p>{faq.answer}</p></TrackedDetails>) : <div className="notice">No matching answers. <button className="btn ghost" type="button" onClick={() => setSearch('')}>Clear search</button></div>}
      </div>
    </div>
  </div>;
}
