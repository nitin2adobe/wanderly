import { validContextualText } from './aaa-contextual-starters.ts';

export function createVisitorBriefStore() {
  let current: { token: symbol; text: string; isFresh: () => boolean } | undefined;
  return {
    set(text: unknown, isFresh?: () => boolean): symbol | undefined {
      current = undefined;
      if (!validContextualText(text, 400) || /[\u007f-\u009f]/.test(text) || !isFresh) return;
      const token = Symbol('visitor-brief');
      current = { token, text, isFresh };
      return token;
    },
    get(): string | undefined {
      if (!current) return;
      try {
        if (current.isFresh()) return current.text;
      } catch (error) {
        console.error('[aaa-brief] freshness.failed', error);
      }
      current = undefined;
    },
    clear(token?: symbol) {
      if (!token || current?.token === token) current = undefined;
    },
  };
}

export const visitorBriefStore = createVisitorBriefStore();
