import type { ConciergeIntent } from './concierge-handoff.ts';

export type AssistanceCopy = { headline: string; body: string; cta: string; dismiss: string };

export function formatList(items: string[]): string {
  const clean = [...new Set(items.map(item => item.trim()).filter(Boolean))];
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

/** Invitation wording is observational and only promises what the concierge can deliver. */
export function assistanceCopy(intent: ConciergeIntent, entities: string[]): AssistanceCopy {
  const list = formatList(entities);
  const dismiss = 'Not now';
  switch (intent) {
    case 'DESTINATION_COMPARISON':
      return list && entities.length > 1
        ? { headline: `Need help comparing ${list}?`, body: 'I can lay out the differences side by side.', cta: 'Compare options', dismiss }
        : { headline: 'Need help choosing a destination?', body: 'I can help you narrow down the options.', cta: 'Compare options', dismiss };
    case 'PACKAGE_SELECTION':
      return list
        ? { headline: `Need help choosing a package for ${list}?`, body: 'I can summarise what each one offers.', cta: 'Compare packages', dismiss }
        : { headline: 'Need help choosing a package?', body: 'I can summarise what each one offers.', cta: 'Compare packages', dismiss };
    case 'TRAVEL_INFORMATION':
      return list
        ? { headline: `Looking for travel details for ${list}?`, body: 'I can help with the questions you are researching.', cta: 'Get travel help', dismiss }
        : { headline: 'Looking for travel details?', body: 'I can help with the questions you are researching.', cta: 'Get travel help', dismiss };
  }
}
