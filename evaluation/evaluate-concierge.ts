import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { checkConciergeAnswer, conciergeAnswerCases } from '../lib/concierge-evaluation.ts';

async function main() {
  if (process.argv.includes('--list')) {
    console.log(JSON.stringify(conciergeAnswerCases.map(item => ({ caseId: item.id, question: item.question })), null, 2));
    return;
  }
  const input = process.argv.find(arg => arg.startsWith('--input='))?.slice('--input='.length);
  if (!input) throw new Error('Use --list for test questions, or --input=<local-json> containing [{caseId, responseText}]. Use only approved non-sensitive test answers; nothing is sent to Adobe.');
  const data: unknown = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(data) || !data.length) throw new Error('Expected a non-empty array of captured test responses.');
  const seen = new Set<string>();
  const results = data.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('caseId' in item) || typeof item.caseId !== 'string' || !('responseText' in item) || typeof item.responseText !== 'string') throw new Error('Each entry requires string caseId and responseText.');
    const testCase = conciergeAnswerCases.find(candidate => candidate.id === item.caseId);
    if (!testCase || seen.has(item.caseId)) throw new Error('Unknown or duplicate caseId.');
    seen.add(item.caseId);
    return checkConciergeAnswer(testCase, item.responseText);
  });
  const missingCases = conciergeAnswerCases.filter(item => !seen.has(item.id)).map(item => item.id);
  const report = { timestamp: new Date().toISOString(), scope: 'Heuristic checks on supplied test answers only; not live verification or semantic accuracy.', missingCases, results };
  await mkdir('evaluation/results', { recursive: true });
  await writeFile('evaluation/results/concierge-answer-checks.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (missingCases.length || results.some(result => !result.checksPassed)) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
