/**
 * Consent gate for the Adaptive Assistance Agent (AAA).
 *
 * The site's consent management platform (CMP) is authoritative. A host that
 * has one exposes it to AAA as `window.aaaConsentAuthority` before AAA loads.
 * Only a fixture without a CMP (such as the Wanderly demo) falls back to the
 * demo banner authority, which stands in for a CMP and remembers the choice.
 * Until consent is granted AAA collects nothing, persists nothing, calls no
 * AAA service or model and transmits no context.
 */
export type ConsentState = 'pending' | 'granted' | 'denied';

export type ConsentAuthority = {
  readonly kind: 'host-cmp' | 'demo-banner';
  get(): ConsentState;
  subscribe(listener: (state: ConsentState) => void): () => void;
};

export type DemoConsentAuthority = ConsentAuthority & {
  kind: 'demo-banner';
  decide(state: 'granted' | 'denied'): void;
  /** Notifies listeners of a decision made in another tab. */
  sync(): void;
};

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const CONSENT_STORAGE_KEY = 'aaa.consent.v1';
export const CONSENT_CHANGED = 'aaa:consent-changed';

const isState = (value: unknown): value is ConsentState => value === 'pending' || value === 'granted' || value === 'denied';

export function createDemoConsentAuthority(store: KeyValueStore | undefined, notify: (state: ConsentState) => void = () => {}): DemoConsentAuthority {
  const listeners = new Set<(state: ConsentState) => void>();
  let memory: ConsentState = 'pending';
  const read = (): ConsentState => {
    try {
      const value = store?.getItem(CONSENT_STORAGE_KEY);
      return value === 'granted' || value === 'denied' ? value : memory;
    } catch { return memory; }
  };
  return {
    kind: 'demo-banner',
    get: read,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    decide(state) {
      memory = state;
      try { store?.setItem(CONSENT_STORAGE_KEY, state); } catch {}
      listeners.forEach(listener => listener(state));
      notify(state);
    },
    sync() {
      const state = read();
      listeners.forEach(listener => listener(state));
      notify(state);
    },
  };
}

function isAuthority(value: unknown): value is Omit<ConsentAuthority, 'kind'> {
  try {
    return !!value && typeof (value as ConsentAuthority).get === 'function' && typeof (value as ConsentAuthority).subscribe === 'function';
  } catch {
    return false;
  }
}

/** Wraps a host CMP adapter so an unknown or failing value fails closed to pending. */
export function hostConsentAuthority(host: Omit<ConsentAuthority, 'kind'>): ConsentAuthority {
  let subscriptionFailed = false;
  const safe = (): ConsentState => {
    if (subscriptionFailed) return 'pending';
    try {
      const state = host.get();
      return isState(state) ? state : 'pending';
    } catch { return 'pending'; }
  };
  return {
    kind: 'host-cmp',
    get: safe,
    subscribe(listener) {
      try {
        const unsubscribe = host.subscribe(() => listener(safe()));
        if (typeof unsubscribe !== 'function') throw new Error('CMP subscription did not return an unsubscribe function.');
        return unsubscribe;
      } catch (error) {
        subscriptionFailed = true;
        console.error('Unable to subscribe to the host consent authority:', error);
        return () => {};
      }
    },
  };
}

declare global {
  interface Window { aaaConsentAuthority?: Omit<ConsentAuthority, 'kind'> }
}

let demoAuthority: DemoConsentAuthority | undefined;
const hostAuthorities = new WeakMap<object, ConsentAuthority>();

export function getConsentAuthority(): ConsentAuthority {
  if (typeof window === 'undefined') return { kind: 'demo-banner', get: () => 'pending', subscribe: () => () => {} };
  if (isAuthority(window.aaaConsentAuthority)) {
    const host = window.aaaConsentAuthority;
    let authority = hostAuthorities.get(host);
    if (!authority) {
      authority = hostConsentAuthority(host);
      hostAuthorities.set(host, authority);
    }
    return authority;
  }
  if ('aaaConsentAuthority' in window) {
    return { kind: 'host-cmp', get: () => 'pending', subscribe: () => () => {} };
  }
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch (error) { console.error('Unable to access demo consent storage:', error); }
  if (!demoAuthority) {
    const authority = createDemoConsentAuthority(storage, state => window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: state })));
    // Journey data is per tab, so every open tab must observe a decline and purge its own copy.
    window.addEventListener('storage', event => { if (event.key === CONSENT_STORAGE_KEY || event.key === null) authority.sync(); });
    demoAuthority = authority;
  }
  return demoAuthority;
}

export function getDemoConsentAuthority(): DemoConsentAuthority | undefined {
  const authority = getConsentAuthority();
  return authority.kind === 'demo-banner' && 'decide' in authority ? authority as DemoConsentAuthority : undefined;
}

export const isConsentGranted = () => getConsentAuthority().get() === 'granted';

/** Adobe standard 1.0 consent payload for Web SDK setConsent. */
export const alloyConsent = (general: 'in' | 'out') => ({ consent: [{ standard: 'Adobe', version: '1.0', value: { general } }] });

type Alloy = (command: string, options?: unknown) => Promise<unknown>;

/**
 * Starts a Web SDK instance that AAA owns: configure with pending consent,
 * then setConsent and sendEvent only once the authority grants consent. The
 * returned `ready` settles after configure, so Brand Concierge is never
 * blocked waiting for a consent decision. A host-owned SDK is never touched:
 * the host configures it and drives its consent.
 */
export function startConsentGatedWebSdk({ alloy, hostOwned, authority, configuration }: {
  alloy: Alloy;
  hostOwned: boolean;
  authority: ConsentAuthority;
  configuration: Record<string, unknown>;
}) {
  if (hostOwned) {
    const ready = Promise.resolve();
    return { ready, settled: () => ready, dispose: () => {} };
  }
  let disposed = false;
  let sentInitialEvent = false;
  let applied: 'in' | 'out' | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const apply = (state: ConsentState) => {
    if (disposed || state === 'pending') return chain;
    const value = state === 'granted' ? 'in' : 'out';
    if (value === applied) return chain;
    applied = value;
    chain = chain.then(async () => {
      if (disposed) return;
      if (value === 'in' && authority.get() !== 'granted') return;
      await alloy('setConsent', alloyConsent(value));
      if (value === 'in' && !sentInitialEvent && !disposed && authority.get() === 'granted') {
        sentInitialEvent = true;
        await alloy('sendEvent', {});
      }
    }).catch(error => console.error('Unable to apply consent to the Web SDK:', error));
    return chain;
  };
  let unsubscribe = () => {};
  const ready = alloy('configure', { ...configuration, defaultConsent: 'pending' }).then(() => {
    if (disposed) return;
    unsubscribe = authority.subscribe(apply);
    void apply(authority.get());
  });
  return {
    ready,
    settled: () => ready.then(() => chain),
    dispose: () => { disposed = true; unsubscribe(); },
  };
}
