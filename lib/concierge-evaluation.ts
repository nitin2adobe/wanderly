import { getPackage } from './data.ts';
import { conciergeKnowledge } from './concierge-knowledge.ts';

export type ConciergeAnswerCase = {
  id: string;
  question: string;
  packageIds: string[];
  requiresPrice: boolean;
  requiresNights: boolean;
  requiredTopics: string[][];
};

export const conciergeAnswerCases: ConciergeAnswerCase[] = [
  { id: 'bali-package-comparison', question: 'Compare Island Rhythm and Bali Slow Living by nights, pace, inclusions and illustrative price.', packageIds: ['island-rhythm', 'bali-slow-living'], requiresPrice: true, requiresNights: true, requiredTopics: [['balanced'], ['relaxed'], ['flight'], ['person'], ['sharing']] },
  { id: 'maldives-package-comparison', question: 'Compare Barefoot Blue and Lagoon Retreat by meals, nights and illustrative price.', packageIds: ['barefoot-blue', 'lagoon-retreat'], requiresPrice: true, requiresNights: true, requiredTopics: [['breakfast', 'dinner'], ['three', '3 daily', '3 meals'], ['flight'], ['person'], ['sharing']] },
  { id: 'japan-entry', question: 'How do I verify entry requirements for Japan?', packageIds: [], requiresPrice: false, requiresNights: false, requiredTopics: [['passport'], ['official', 'government'], ['verify', 'check', 'confirm']] },
];

/** Conservative text checks for manual review, not a semantic judge or a guarantee of correctness. */
export function checkConciergeAnswer(testCase: ConciergeAnswerCase, answer: string) {
  const text = answer.toLowerCase();
  const issues: string[] = [];
  const expectedPackages = testCase.packageIds.map(id => {
    const pack = getPackage(id);
    if (!pack) throw new Error(`Unknown evaluation package: ${id}`);
    return pack;
  });
  if (!answer.trim()) issues.push('Empty response.');
  for (const pack of expectedPackages) {
    const start = text.indexOf(pack.packageName.toLowerCase());
    if (start === -1) issues.push(`Missing package: ${pack.packageName}.`);
    const next = expectedPackages.filter(other => other.id !== pack.id).map(other => text.indexOf(other.packageName.toLowerCase(), start + pack.packageName.length)).filter(index => index >= 0);
    const section = start === -1 ? '' : answer.slice(start, next.length ? Math.min(...next) : undefined);
    if (testCase.requiresPrice && !new RegExp(`(?:\\$|usd\\s*)${pack.priceValue.toLocaleString('en-US').replace(',', ',?')}\\b`, 'i').test(section)) issues.push(`Missing expected illustrative price beside ${pack.packageName}.`);
    if (testCase.requiresNights && !new RegExp(`\\b${pack.nights}\\s*[- ]?\\s*nights?\\b`, 'i').test(section)) issues.push(`Missing expected duration beside ${pack.packageName}.`);
  }
  const allowedPrices = new Set(expectedPackages.map(pack => pack.priceValue));
  for (const match of answer.matchAll(/(?:\$|USD\s*)(\d[\d,]*(?:\.\d{2})?)/gi)) {
    if (!allowedPrices.has(Number(match[1].replace(/,/g, '')))) issues.push('Unverified monetary amount in response.');
  }
  if (testCase.requiresPrice && !/\b(illustrative|sample|fictional|demo)\b/i.test(answer)) issues.push('Missing illustrative-price disclaimer.');
  for (const alternatives of testCase.requiredTopics) {
    if (!alternatives.some(topic => text.includes(topic))) issues.push(`Missing expected topic: ${alternatives.join(' / ')}.`);
  }
  if (/\b(?:availability|entry|visa|weather)\s+(?:is\s+)?guaranteed\b|\b(?:booking|reservation)\s+(?:is\s+)?confirmed\b/i.test(answer)) issues.push('Potential unsupported guarantee; review manually.');
  return { caseId: testCase.id, catalogVersion: conciergeKnowledge().version, checksPassed: issues.length === 0, issues, manualReviewRequired: true };
}
