import summary from '@/evaluation/results/grounding-summary.json';

export default function GroundingScoreboard() {
  const surfaces = Object.values(summary.surfaces);
  const proposals = surfaces.reduce((total, item) => total + item.proposals, 0);
  const rejected = surfaces.reduce((total, item) => total + item.rejected, 0);
  const categories = Object.entries(summary.rejectedByCategory)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([category, count]) => `${category.replaceAll('_', ' ')} (${count})`).join(', ');
  return <aside className="groundingScoreboard" aria-label="Grounding evaluation">
    <h3>Grounding evaluation</h3>
    <p><strong>{proposals} proposals · {rejected} rejected · {summary.violationsReachingOutput} detected violations in output</strong></p>
    <p>{summary.sampleSize} scripted cases · {summary.date.slice(0, 10)} · fixed synthetic comparison</p>
    <p>Top rejection categories by scenario: {categories}.</p>
    <p className="muted">Not a live-model safety or quality claim. Live latency and review of at least 30 outputs are pending.</p>
  </aside>;
}
