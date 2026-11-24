import { Suspense } from 'react';
import BookingPlanner from '@/components/BookingPlanner';

export default function Page() {
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Plan your trip</div><h1 className="display">One step closer.</h1>
    <p className="muted contentIntro">Choose your preferences, review the outline and prepare a local demo request. There is no live availability search, reservation or payment.</p>
    <Suspense fallback={<p className="muted" role="status">Loading your trip selection...</p>}><BookingPlanner/></Suspense>
  </section></main>;
}
