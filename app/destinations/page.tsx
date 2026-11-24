import DestinationExplorer from '@/components/DestinationExplorer';

export default async function Page({ searchParams }: { searchParams: Promise<{ search?: string | string[] }> }) {
  const query = await searchParams;
  const search = typeof query.search === 'string' ? query.search : '';
  return <main className="shell"><section className="section topspace">
    <div className="eyebrow">Destinations</div><h1 className="display">Choose a different rhythm.</h1>
    <p className="muted contentIntro">From private-island stillness to food-led cities and mountain railways, find a place that suits the way you want to spend your days.</p>
    <DestinationExplorer key={search} initialSearch={search}/>
    <div className="notice contentDisclaimer">All destination guidance and starting prices are illustrative. Confirm conditions, entry requirements and final quotes before real travel.</div>
  </section></main>;
}
