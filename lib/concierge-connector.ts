import type { ConciergeHandoff } from './concierge-handoff.ts';

/** Integration boundary between the activation plugin and a brand's concierge. */
export type ConciergeConnector = {
  readonly name: string;
  supportsBrand(brand: string): boolean;
  open(handoff: ConciergeHandoff, options?: ConciergeOpenOptions): void;
};

export type ConciergeOpenOptions = { initialMessage?: string };
export const CONCIERGE_OPEN_EVENT = 'wanderly:concierge-open';
export const CONCIERGE_CLOSE_EVENT = 'wanderly:concierge-close';

const HIDDEN_ROUTES = ['/agent', '/booking'];
const HIDDEN_EXACT = ['/demo', '/demo/live'];
export const isHiddenConciergeRoute = (pathname: string | null) =>
  !!pathname && (HIDDEN_EXACT.includes(pathname) || HIDDEN_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`)));

/** Opens the Adobe client without sending the local invitation payload to it. */
export const adobeConnector: ConciergeConnector = {
  name: 'adobe-brand-concierge',
  supportsBrand(brand) {
    return brand === 'wanderly';
  },
  open(handoff, options) {
    if (!adobeConnector.supportsBrand(handoff.brand)) {
      throw new Error(`Adobe Brand Concierge is not configured for ${handoff.brand}.`);
    }

    // The listener acknowledges that the mounted chat can receive the request.
    const request = options?.initialMessage
      ? new CustomEvent<ConciergeOpenOptions>(CONCIERGE_OPEN_EVENT, { cancelable: true, detail: { initialMessage: options.initialMessage } })
      : new Event(CONCIERGE_OPEN_EVENT, { cancelable: true });
    window.dispatchEvent(request);
    if (!request.defaultPrevented) throw new Error('Adobe Brand Concierge is not available.');
  },
};
