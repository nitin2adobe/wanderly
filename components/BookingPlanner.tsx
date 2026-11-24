'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { destinations, getBookingSelection, getDestination, getPackage, getPackagesForDestination } from '@/lib/data';
import { track } from '@/lib/tracking';

export default function BookingPlanner() {
  const searchParams = useSearchParams();
  const destinationValues = searchParams.getAll('destination');
  const packageValues = searchParams.getAll('package');
  const selection = getBookingSelection(destinationValues.length === 1 ? destinationValues[0] : undefined, packageValues.length === 1 ? packageValues[0] : undefined);
  return selection ? <BookingForm key={`${selection.destination.slug}-${selection.pack?.id ?? ''}`} initialDestination={selection.destination.slug} initialPackage={selection.pack?.id}/> :
    <div className="notice" role="alert">This trip selection is unavailable or the package does not match the destination. <Link href="/packages">Choose a journey from the catalog</Link>.</div>;
}

function BookingForm({ initialDestination, initialPackage }: { initialDestination: string; initialPackage?: string }) {
  const [destinationSlug, setDestinationSlug] = useState(initialDestination);
  const [packageId, setPackageId] = useState(initialPackage ?? '');
  const [date, setDate] = useState('');
  const [travellers, setTravellers] = useState('2 adults');
  const [pace, setPace] = useState(getPackage(initialPackage ?? '')?.pace ?? 'Balanced');
  const [step, setStep] = useState<'plan' | 'review' | 'prepared'>('plan');
  const started = useRef(false);
  const destination = getDestination(destinationSlug);
  const pack = getPackage(packageId);
  const choices = getPackagesForDestination(destinationSlug);
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const progress = (entity?: string) => {
    track(started.current ? 'BOOKING_STEP' : 'BOOKING_START', window.location.pathname, entity);
    started.current = true;
  };
  if (!destination) return <div className="notice" role="alert">This destination is unavailable. <Link href="/booking">Start a new plan</Link></div>;

  const summary = <dl className="bookingSummary">
    <div><dt>Destination</dt><dd>{destination.name}</dd></div>
    <div><dt>Journey</dt><dd>{pack?.packageName ?? 'Tailor a journey'}</dd></div>
    <div><dt>Duration</dt><dd>{pack?.days ?? destination.days}</dd></div>
    <div><dt>Preferred departure</dt><dd>{date || 'Choose a date'}</dd></div>
    <div><dt>Travellers</dt><dd>{travellers}</dd></div>
    <div><dt>Preferred pace</dt><dd>{pace}</dd></div>
    <div><dt>Sample price</dt><dd>{pack?.price ?? destination.from} per person</dd></div>
  </dl>;

  return <div className="booking">
    {step === 'plan' ? <form className="panel" onSubmit={event => { event.preventDefault(); progress('review-request'); setStep('review'); }}>
      <div className="eyebrow">Step 1 / Your preferences</div><h2 className="contentHeading">Make it your trip.</h2>
      <div className="field"><label htmlFor="booking-destination">Destination</label><select id="booking-destination" value={destinationSlug} onChange={event => { setDestinationSlug(event.target.value); setPackageId(''); progress(event.target.value); }}>{destinations.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div>
      <div className="field"><label htmlFor="booking-package">Journey</label><select id="booking-package" value={packageId} onChange={event => { setPackageId(event.target.value); const selected = getPackage(event.target.value); if (selected) setPace(selected.pace); progress(event.target.value || 'tailored-journey'); }}><option value="">Help me tailor a journey</option>{choices.map(item => <option key={item.id} value={item.id}>{item.packageName} / {item.days} / {item.price}</option>)}</select></div>
      <div className="field"><label htmlFor="booking-date">Preferred departure date</label><input id="booking-date" type="date" required min={minDate} value={date} onChange={event => { setDate(event.target.value); track('DATE_SEARCH', window.location.pathname); progress('departure-date'); }}/></div>
      <div className="field"><label htmlFor="booking-travellers">Travellers</label><select id="booking-travellers" value={travellers} onChange={event => { setTravellers(event.target.value); progress('travellers'); }}>{['1 adult', '2 adults', '2 adults + 1 child', '4 adults'].map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="field"><label htmlFor="booking-pace">Preferred trip pace</label><select id="booking-pace" value={pace} onChange={event => {
        const value = event.target.value;
        if (value !== 'Relaxed' && value !== 'Balanced' && value !== 'Active') throw new Error('Unsupported trip pace selection.');
        setPace(value);
        progress('trip-pace');
      }}>{['Relaxed', 'Balanced', 'Active'].map(value => <option key={value}>{value}</option>)}</select></div>
      <button className="btn" type="submit">Review my trip</button>
    </form> : <section className="panel" aria-labelledby="request-heading">
      <div className="eyebrow">{step === 'review' ? 'Step 2 / Review' : 'Local demo preview'}</div>
      <h2 id="request-heading" className="contentHeading">{step === 'review' ? 'Here is your trip outline.' : 'Your demo request is ready.'}</h2>
      {summary}
      {step === 'prepared' && <div className="notice" role="status">Prepared in this page only. No request was sent, no dates were reserved and no payment was collected. This is not a booking confirmation.</div>}
      <div className="contentActions">
        <button className="btn ghost" type="button" onClick={() => setStep('plan')}>Edit preferences</button>
        {step === 'review' && <button className="btn" type="button" onClick={() => { progress('demo-request-prepared'); setStep('prepared'); }}>Prepare demo request</button>}
        {step === 'prepared' && <Link className="btn ghost" href={`/destinations/${destinationSlug}`}>Back to {destination.name}</Link>}
      </div>
    </section>}
    <aside className="panel">
      <div className="eyebrow">{step === 'plan' ? 'Your evolving plan' : 'What a real quote would confirm'}</div><h2 className="contentHeading">Clear choices, no surprises.</h2>
      {step === 'plan' && summary}
      <p className="muted">{pack?.summary ?? destination.bestFor}</p>
      <ul className="list"><li>Actual availability and final room category</li><li>Flight and transfer timings, plus baggage allowances</li><li>Child or single-occupancy pricing, local charges and optional extras</li><li>Deposit, changes and cancellation terms before payment</li></ul>
      <div className="notice">Sample prices are per person based on two adults sharing, not a quote for your party. Flights and insurance are excluded. No contact or payment information is needed for this demo.</div>
      <p><Link href={`/travel-info?destination=${destinationSlug}`}>Read practical travel answers</Link></p>
    </aside>
  </div>;
}
