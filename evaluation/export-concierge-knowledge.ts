import { writeFile, mkdir } from 'node:fs/promises';
import { conciergeKnowledge, conciergeKnowledgeCsv } from '../lib/concierge-knowledge.ts';

async function main() {
  const baseUrl = process.argv.find(arg => arg.startsWith('--base-url='))?.slice('--base-url='.length);
  if (!baseUrl) throw new Error('Provide --base-url=https://your-approved-deployment.example (include any deployment base path). Nothing is uploaded automatically.');
  const csv = conciergeKnowledgeCsv(baseUrl);
  await mkdir('evaluation/results', { recursive: true });
  await writeFile('evaluation/results/concierge-knowledge-urls.csv', csv, 'utf8');
  await writeFile('evaluation/results/concierge-knowledge.json', JSON.stringify(conciergeKnowledge(), null, 2), 'utf8');
  console.log('Exported knowledge URL CSV and versioned catalog JSON to evaluation/results. Publish the site and configure/reprocess the source in Adobe; this command does not upload data.');
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
