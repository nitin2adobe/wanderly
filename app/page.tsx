import Link from 'next/link';
import DestinationCard from '@/components/DestinationCard';
import TripSearch from '@/components/TripSearch';
import NewSessionButton from '@/components/NewSessionButton';
import { destinations } from '@/lib/data';

export default function Home() {
  return <main><div className="shell">
    <section className="hero" style={{ backgroundImage: `url(${destinations[1].image})` }}>
      <div className="heroContent">
        <div className="eyebrow">Curated journeys / thoughtfully matched</div>
        <h1>Find your kind of somewhere.</h1>
        <p>Some trips need a quiet island. Others need a food trail, a train window or one more day with no plans. Find the place and pace that feel like you.</p>
        <div className="contentActions"><Link href="/destinations" className="btn secondary">Explore destinations</Link><Link href="/packages" className="btn secondary">Browse journeys</Link><NewSessionButton/></div>
      </div>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">Start somewhere</div><h2>Six places.<br/>More ways to make them yours.</h2></div><p>Compare the daily rhythm, the travel time and the real trade-offs. Each destination has two sample journeys with different stays, pacing and inclusions.</p></div>
      <div className="grid">{destinations.map(destination => <DestinationCard d={destination} key={destination.slug}/>)}</div>
    </section>
    <section className="section">
      <div className="sectionHead"><div><div className="eyebrow">What kind of trip?</div><h2>Start with what matters.</h2></div><p>A few starting points for a first trip, a shared celebration or a slower escape. These are travel ideas, not guaranteed availability.</p></div>
      <div className="contentGrid">
        <article className="panel"><div className="eyebrow">A slower island escape</div><h3>One villa or two different worlds?</h3><p className="muted">Compare Bali's cultural days with the Maldives' single-island calm. Look at transfers and meals, not only the view.</p><Link className="btn ghost" href="/destinations?search=beach">Explore island ideas</Link></article>
        <article className="panel"><div className="eyebrow">Food, streets and discovery</div><h3>Leave room for another neighbourhood.</h3><p className="muted">Japan, Thailand and Portugal reward curious walkers. Balance guided introductions with independent afternoons.</p><Link className="btn ghost" href="/destinations?search=food">Find food-led trips</Link></article>
        <article className="panel"><div className="eyebrow">Views without the rush</div><h3>Take the scenic way.</h3><p className="muted">Choose a Swiss rail journey or linger beside a lake. Keep a flexible day for weather and spontaneous stops.</p><Link className="btn ghost" href="/destinations/switzerland">Explore scenic journeys</Link></article>
      </div>
    </section>
    <section className="section"><div className="band"><div><div className="eyebrow">Not sure yet?</div><h2>Follow the feeling, not the filter.</h2><p>Search for a mood or an experience, then compare the destinations that fit. You can ask practical questions before committing to dates.</p></div><div><TripSearch/><p><Link className="btn secondary" href="/travel-info">Read practical travel answers</Link></p></div></div></section>
    <div className="notice contentDisclaimer">Wanderly is a fictional demo. Prices, stays, itineraries and seasonal notes are illustrative; there is no live availability or booking service.</div>
  </div></main>;
}
