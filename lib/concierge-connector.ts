import type { ConciergeHandoff } from './concierge-handoff.ts';
import type { ConciergeOpenResult } from './brand-concierge-client.ts';
import type { StarterResult } from '../aaa/contracts/types.ts';

export type ConciergeOpenOptions = { initialMessage?: string; signal?: AbortSignal; activationId?: string; explanation?: string; automatic?: boolean; starterResult?: StarterResult; stillEligible?: () => boolean };
export type ConciergeOpenRequest = ConciergeOpenOptions & {
  resolve: (result: ConciergeOpenResult) => void;
  reject: (error: Error) => void;
};
export type ConciergeConnector = {
  readonly name: string;
  supportsBrand(brand: string): boolean;
  open(handoff: ConciergeHandoff, options?: ConciergeOpenOptions): Promise<ConciergeOpenResult>;
  openStarters?(result: StarterResult, options?: ConciergeOpenOptions): Promise<ConciergeOpenResult>;
};

export const CONCIERGE_OPEN_EVENT = 'wanderly:concierge-open';
export const CONCIERGE_CLOSE_EVENT = 'wanderly:concierge-close';

const HIDDEN_ROUTES = ['/agent', '/booking', '/concierge-knowledge'];
const HIDDEN_EXACT = ['/demo', '/demo/live', '/demo/compare'];
export const isHiddenConciergeRoute = (pathname: string | null) =>
  !!pathname && (HIDDEN_EXACT.includes(pathname) || HIDDEN_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`)));

export const adobeConnector: ConciergeConnector = {
  name: 'adobe-brand-concierge',
  supportsBrand: brand => brand === 'wanderly',
  open(handoff, options = {}) {
    if (!adobeConnector.supportsBrand(handoff.brand)) return Promise.reject(new Error(`Adobe Brand Concierge is not configured for ${handoff.brand}.`));
    return dispatchOpen(options);
  },
  openStarters(result, options = {}) {
    return dispatchOpen({ ...options, starterResult: result, automatic: false });
  },
};

function dispatchOpen(options: ConciergeOpenOptions): Promise<ConciergeOpenResult> {
    if (options.signal?.aborted) return Promise.resolve({ status: 'cancelled' });
    return new Promise((resolve, reject) => {
      let settled = false;
      const complete = (result?: ConciergeOpenResult, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', cancel);
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error('Brand Concierge returned no opening result.'));
      };
      const cancel = () => complete({ status: 'cancelled' });
      const timeout = setTimeout(() => complete(undefined, new Error('Brand Concierge did not acknowledge opening in time.')), 15_000);
      options.signal?.addEventListener('abort', cancel, { once: true });
      const request = new CustomEvent<ConciergeOpenRequest>(CONCIERGE_OPEN_EVENT, {
        cancelable: true,
        detail: { ...options, resolve: result => complete(result), reject: error => complete(undefined, error) },
      });
      window.dispatchEvent(request);
      if (!request.defaultPrevented) complete(undefined, new Error('Adobe Brand Concierge is not available.'));
    });
}
