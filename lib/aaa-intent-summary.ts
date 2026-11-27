import { validContextualText } from './aaa-contextual-starters.ts';

export function createIntentSummaryStore() {
  let current: { token: symbol; text: string; isFresh: () => boolean } | undefined;
  return {
    set(text: unknown, isFresh?: () => boolean): symbol | undefined {
      current = undefined;
      if (!validContextualText(text, 200) || !isFresh) return;
      const token = Symbol('intent-summary');
      current = { token, text, isFresh };
      return token;
    },
    get(): string | undefined {
      if (!current) return;
      try {
        if (current.isFresh()) return current.text;
      } catch (error) {
        console.error('[aaa-intent] freshness.failed', error);
      }
      current = undefined;
    },
    clear(token?: symbol) {
      if (!token || current?.token === token) current = undefined;
    },
  };
}

export const intentSummaryStore = createIntentSummaryStore();
