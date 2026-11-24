import Link from 'next/link';
import { conciergeKnowledge } from '@/lib/concierge-knowledge';

export const metadata = { title: 'Wanderly demo catalog and answer guidance' };

export default function Page() {
  const knowledge = conciergeKnowledge();
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Public demo knowledge source / {knowledge.version}</div>
    <h1 className="display">Wanderly catalog facts.</h1>
    <div className="notice"><p>{knowledge.disclaimer}</p><p>{knowledge.priceBasis}</p></div>
    <h2>Answer guidance</h2><ul className="list">{knowledge.guardrails.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <section className="section"><h2>Package facts</h2>{knowledge.packages.map(pack => <article className="panel" key={pack.id}>
      <h3><Link href={pack.path}>{pack.name}</Link></h3><p>{pack.summary}</p>
      <p>Destination: {pack.destinationSlug}. {pack.nights} nights. {pack.pace} pace. Illustrative price: USD {pack.illustrativePricePerPerson} per person, two adults sharing.</p>
      <p>Stay category: {pack.stay} (fictional, not a reservation).</p>
      <h4>Included</h4><ul>{pack.included.map(item => <li key={item}>{item}</li>)}</ul>
      <h4>Excluded</h4><ul>{pack.excluded.map(item => <li key={item}>{item}</li>)}</ul>
      <h4>Sample itinerary</h4>{pack.itinerary.map(stop => <p key={stop.stage}>{stop.stage}: {stop.description}</p>)}
    </article>)}</section>
    <section><h2>Destination planning and practical questions</h2>{knowledge.destinations.map(destination => <article className="panel" key={destination.slug}>
      <h3><Link href={destination.path}>{destination.name}</Link></h3>
      <p>{destination.bestFor}</p><p>Trade-off: {destination.tradeoff}</p><p>{destination.gettingAround}</p><p>{destination.season}</p>
      {destination.faqs.map(faq => <div key={faq.id}><h4>{faq.question}</h4><p>{faq.answer}</p></div>)}
    </article>)}</section>
  </section></main>;
}
