import { validContextualText } from './aaa-contextual-starters.ts';

export function nudgeWhy(text: unknown): string {
  return validContextualText(text, 160) ? text
    : 'Your recent browsing matches an assistance rule for this page. This is optional; no chat message is sent unless you choose a question in chat.';
}
