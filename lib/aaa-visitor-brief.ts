import { validContextualText } from './aaa-contextual-starters.ts';

export type VisitorBriefIdentity = {
  sessionId: string;
  profileId: string;
  profileVersion: string;
};

export function visitorBriefIsFresh(
  identity: VisitorBriefIdentity,
  expiresAt: string,
  current: VisitorBriefIdentity | undefined,
  now = Date.now(),
): boolean {
  const expiry = Date.parse(expiresAt);
  return !!current && Number.isFinite(expiry) && expiry > now
    && identity.sessionId === current.sessionId
    && identity.profileId === current.profileId
    && identity.profileVersion === current.profileVersion;
}

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
    get(chatOpen = true): string | undefined {
      if (!current || !chatOpen) return;
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
