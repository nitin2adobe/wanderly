'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { brandIdForPath } from '@/lib/brand-config';
import { adobeConnector, CONCIERGE_OPEN_EVENT, CONCIERGE_CLOSE_EVENT, isHiddenConciergeRoute, type ConciergeOpenOptions, type ConciergeOpenRequest } from '@/lib/concierge-connector';
import { createConciergeClient, withConciergeSuggestion, type ConciergeBootstrapOptions, type ConciergeOpenResult } from '@/lib/brand-concierge-client';
import { isForwardProgress } from '@/lib/assistance-policy';
import { buildJourneyContext } from '@/lib/journey-context';
import { getEvents, getSessionId, track } from '@/lib/tracking';
import { createConciergeEventRouter } from '@/lib/concierge-observer';
import { defaultConciergeWelcomeExamples, manualConciergeSuggestion } from '@/lib/concierge-context';
import { getComparisonSlugs } from '@/components/DestinationComparison';
import { createAmbientContextHook, readAmbientPage } from '@/lib/ambient-context';
import { getConsentAuthority, startConsentGatedWebSdk } from '@/lib/aaa-consent';
import { isAaaEnabled } from '@/lib/aaa-runtime';
import { useAaaAvailability } from '@/components/AaaConsent';

// True once this component has installed the Web SDK, so a remount does not mistake it for a host-owned one.
let ownsAlloy = false;

declare global {
  interface Window {
    alloy: ((...args: unknown[]) => Promise<unknown>) & { q?: unknown[] };
    __alloyNS?: string[];
    styleConfiguration?: object;
    adobe: { concierge: { bootstrap: (options: ConciergeBootstrapOptions) => void | Promise<void> } };
  }
}

export default function BrandConcierge() {
  const aaa = useAaaAvailability();
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ReturnType<typeof createConciergeClient> | null>(null);
  const observerRef = useRef<{ sessionId: string; router: ReturnType<typeof createConciergeEventRouter> } | undefined>(undefined);
  const openSequence = useRef(0);
  const [suggestion, setSuggestion] = useState<ConciergeOpenOptions | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const pathname = usePathname();
  const destinationParam = useSearchParams().get('destination');
  const chatAvailable = pathname !== '/demo/live' && adobeConnector.supportsBrand(brandIdForPath(pathname));
  const [initializeClient, setInitializeClient] = useState(chatAvailable);

  const wasEnabled = useRef(aaa.enabled);
  useEffect(() => {
    const lost = wasEnabled.current && !aaa.enabled;
    wasEnabled.current = aaa.enabled;
    if (!aaa.enabled) {
      setSuggestion(null);
      setCopyStatus('');
    }
    // Revocation resets SDK-owned examples, accepting loss of the visible transcript.
    if (!lost) return;
    const client = clientRef.current;
    if (!client) return;
    const sequence = ++openSequence.current;
    client.cancel();
    if (isOpenRef.current) setStatus('loading');
    void client.resetWelcome(defaultConciergeWelcomeExamples()).then(() => {
      if (clientRef.current === client && sequence === openSequence.current && isOpenRef.current) setStatus('ready');
    }).catch(error => {
      console.error('Unable to clear personalized welcome questions:', error);
      if (clientRef.current === client && sequence === openSequence.current) setStatus('error');
    });
  }, [aaa.enabled]);

  useEffect(() => {
    if (chatAvailable) setInitializeClient(true);
  }, [chatAvailable]);

  useEffect(() => {
    if (!initializeClient) return;
    const mount = mountRef.current;
    if (!mount) {
      console.error('Adobe Brand Concierge mount is not available.');
      setStatus('error');
      return;
    }
    let active = true;
    const scripts: HTMLScriptElement[] = [];

    function loadScript(src: string) {
      return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Unable to load ${src}`));
        scripts.push(script);
        document.head.appendChild(script);
      });
    }

    let sdk: ReturnType<typeof startConsentGatedWebSdk> | undefined;
    async function initialize() {
      await loadScript(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/style-config-Nitin2adobe.js`);
      if (!active) return;
      // A Web SDK the host already installed is the host's: AAA never reconfigures it or changes its consent.
      const hostOwned = typeof window.alloy === 'function' && !ownsAlloy;
      if (!hostOwned) {
        ownsAlloy = true;
        (window.__alloyNS = window.__alloyNS || []).push('alloy');
        const alloy: Window['alloy'] = (...args) => new Promise((resolve, reject) => {
          alloy.q!.push([resolve, reject, args]);
        });
        alloy.q = [];
        window.alloy = alloy;
        await loadScript('https://cdn1.adoberesources.net/alloy/2.35.1/alloy.min.js');
        if (!active) return;
      }
      await loadScript('https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js');
      if (!active) return;
      sdk = startConsentGatedWebSdk({
        alloy: (command, options) => window.alloy(command, options),
        hostOwned,
        authority: getConsentAuthority(),
        configuration: {
          edgeDomain: 'edge.adobedc.net',
          edgeBasePath: 'ee',
          datastreamId: '1ccf8a78-69d5-40e7-a44a-a02edc1631a0',
          orgId: 'B4A122FD69126FF30A495FB9@AdobeOrg',
          debugEnabled: true,
          idMigrationEnabled: false,
          thirdPartyCookiesEnabled: false,
          prehidingStyle: '.personalization-container { opacity: 0 !important }',
          conversation: { region: 'va7' },
          ...(process.env.NEXT_PUBLIC_AAA_AMBIENT_CONTEXT === 'off' ? {} : {
            onBeforeEventSend: createAmbientContextHook(() => readAmbientPage(document, window.location), process.env.NEXT_PUBLIC_AAA_CONTEXT_MARKER, undefined, isAaaEnabled),
          }),
        },
      });
      await sdk.ready;
    }

    const ready = initialize();
    const client = createConciergeClient({
      ready,
      mount,
      legacyAutoSubmit: process.env.NEXT_PUBLIC_BC_LEGACY_AUTO_SUBMIT === 'true',
      onEvent: event => {
        const observer = observerRef.current;
        if (observer?.sessionId === getSessionId()) observer.router.receive(event);
      },
      bootstrap: (onEvent, question, examples) => window.adobe.concierge.bootstrap({
        instanceName: 'alloy',
        stylingConfigurations: withConciergeSuggestion(window.styleConfiguration, question, examples),
        selector: '#brand-concierge-mount',
        onEvent,
      }),
      canOpen: (_initialMessage, automatic) => {
        if (!active || !isOpenRef.current || window.location.pathname === '/demo/live' || !adobeConnector.supportsBrand(brandIdForPath(window.location.pathname))) return false;
        if (!automatic) return true;
        if (!isAaaEnabled()) return false;
        const events = getEvents().filter(event => event.sessionId === getSessionId());
        return !isHiddenConciergeRoute(window.location.pathname) && !isForwardProgress(buildJourneyContext(events));
      },
    });
    clientRef.current = client;
    ready.catch(error => {
      if (!active) return;
      console.error('Unable to initialize Adobe Brand Concierge:', error);
      setStatus('error');
    });
    return () => {
      active = false;
      sdk?.dispose();
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
      scripts.forEach((script) => script.remove());
    };
  }, [initializeClient]);

  const openChat = async (options: ConciergeOpenOptions = {}): Promise<ConciergeOpenResult> => {
    if (options.automatic && !isAaaEnabled()) return { status: 'cancelled' };
    const sequence = ++openSequence.current;
    const { signal, activationId } = options;
    const sessionId = getSessionId();
    const context = isAaaEnabled() ? manualConciergeSuggestion(getEvents().filter(event => event.sessionId === sessionId), window.location.pathname, window.location.search, getComparisonSlugs()) : undefined;
    const initialMessage = options.initialMessage ?? context?.initialMessage;
    if (signal?.aborted) return { status: 'cancelled' };
    setSuggestion(initialMessage ? { ...context, ...options, initialMessage } : null);
    setCopyStatus('');
    if (activationId) {
      const request = getEvents().find(event => event.eventType === 'ASSISTANCE_REQUESTED' && event.metadata?.activationId === activationId);
      const assistanceType = typeof request?.metadata?.assistanceType === 'string' ? request.metadata.assistanceType : 'UNKNOWN';
      if (observerRef.current?.sessionId !== sessionId) {
        observerRef.current = {
          sessionId,
          router: createConciergeEventRouter((type, metadata) => {
            if (getSessionId() === sessionId) track(type, window.location.pathname, undefined, metadata);
          }),
        };
      }
      observerRef.current.router.begin({ activationId, assistanceType, question: initialMessage });
    }
    isOpenRef.current = true;
    setIsOpen(true);
    const client = clientRef.current;
    if (!client) {
      console.error('Adobe Brand Concierge is not initialized.');
      setStatus('error');
      throw new Error('Adobe Brand Concierge is not initialized.');
    }
    setStatus('loading');
    try {
      const result = await client.open(initialMessage, signal, options.automatic === true, context ? context.welcomeExamples : defaultConciergeWelcomeExamples());
      if (clientRef.current !== client || sequence !== openSequence.current) return { status: 'cancelled' };
      if (result.status !== 'cancelled') setStatus('ready');
      else {
        isOpenRef.current = false;
        setIsOpen(false);
      }
      return result;
    } catch (error) {
      if (clientRef.current !== client || sequence !== openSequence.current) return { status: 'cancelled' };
      console.error('Unable to open Adobe Brand Concierge:', error);
      setStatus('error');
      if (activationId) {
        isOpenRef.current = false;
        setIsOpen(false);
      }
      throw error;
    }
  };
  const openChatRef = useRef(openChat);
  openChatRef.current = openChat;

  useEffect(() => {
    if (!isOpenRef.current || isHiddenConciergeRoute(pathname)) return;
    clientRef.current?.cancel();
    void openChatRef.current({ automatic: false }).catch(error => console.error('Unable to refresh the current destination question:', error));
  }, [pathname, destinationParam]);

  const closeChat = () => {
    window.dispatchEvent(new Event(CONCIERGE_CLOSE_EVENT));
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      if (window.location.pathname === '/demo/live' || !adobeConnector.supportsBrand(brandIdForPath(window.location.pathname))) return;
      event.preventDefault();
      const options = event instanceof CustomEvent ? event.detail as ConciergeOpenRequest | undefined : undefined;
      openChatRef.current(options).then(result => options?.resolve?.(result), error => {
        if (options?.reject) options.reject(error instanceof Error ? error : new Error('Unable to open chat.'));
        else console.error('Unable to open Brand Concierge manually:', error);
      });
    };
    const onClose = () => {
      openSequence.current++;
      clientRef.current?.cancel();
      isOpenRef.current = false;
      setIsOpen(false);
      setSuggestion(null);
      launcherRef.current?.focus();
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, onOpen);
    window.addEventListener(CONCIERGE_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(CONCIERGE_OPEN_EVENT, onOpen);
      window.removeEventListener(CONCIERGE_CLOSE_EVENT, onClose);
    };
  }, []);

  useEffect(() => {
    if (!chatAvailable) {
      clientRef.current?.cancel();
      isOpenRef.current = false;
      setIsOpen(false);
    }
  }, [chatAvailable]);

  useEffect(() => {
    if (!isOpen || !chatAvailable) return;
    windowRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      closeChat();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, chatAvailable]);

  return (
    <>
      {chatAvailable && <button
        ref={launcherRef}
        className="brandConciergeLauncher"
        type="button"
        aria-label={isOpen ? 'Close Wanderly chat' : 'Open Wanderly chat'}
        aria-expanded={isOpen}
        aria-controls="brand-concierge-window"
        title={isOpen ? 'Close chat' : 'Chat with Wanderly'}
        onClick={() => {
          if (isOpen) closeChat();
          else openChat().catch(error => console.error('Unable to open Brand Concierge manually:', error));
        }}
      >
        {isOpen ? (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.1A7.5 7.5 0 1 1 20 11.5Z" />
            <path d="M8.5 11.5h7M8.5 14.5h4" />
          </svg>
        )}
      </button>}
      <div
        ref={windowRef}
        id="brand-concierge-window"
        className={`brandConciergeWindow${isOpen && chatAvailable ? ' isOpen' : ''}`}
        role="dialog"
        aria-label="Wanderly Brand Concierge"
        aria-hidden={!isOpen || !chatAvailable}
        aria-modal="false"
        inert={!isOpen || !chatAvailable}
        tabIndex={-1}
      >
        {aaa.enabled && suggestion?.initialMessage && <div className="brandConciergeContext">
          <strong>Suggested by Wanderly, based on your browsing</strong>
          <p>{process.env.NEXT_PUBLIC_BC_LEGACY_AUTO_SUBMIT === 'true' && suggestion.automatic ? 'Experimental mode: Wanderly may submit this browsing-based question automatically. It was not typed by you.' : suggestion.explanation ?? 'You can choose this suggested question or ask something else. It was not typed by you.'}</p>
          <p>{suggestion.initialMessage}</p>
          <button type="button" className="btn ghost" onClick={async () => {
            try {
              if (!suggestion.initialMessage) throw new Error('No suggested question is available.');
              await navigator.clipboard.writeText(suggestion.initialMessage);
              setCopyStatus('Copied. Paste into chat and send when you are ready.');
            } catch (error) {
              console.error('Unable to copy the suggested question:', error);
              setCopyStatus('Copy failed. Select the question text and copy it manually.');
            }
          }}>Copy question for chat</button>
          <span role="status">{copyStatus}</span>
        </div>}
        <div ref={mountRef} id="brand-concierge-mount" />
        {status === 'loading' && <div className="brandConciergeStatus" role="status">Connecting to Brand Concierge...</div>}
        {status === 'error' && (
          <div className="brandConciergeStatus" role="alert">
            <p>Brand Concierge couldn't load. Check your connection and reload the page.</p>
            <button className="btn" type="button" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        )}
      </div>
    </>
  );
}