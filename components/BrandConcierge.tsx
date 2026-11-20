'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { brandIdForPath } from '@/lib/brand-config';
import { adobeConnector, CONCIERGE_OPEN_EVENT, CONCIERGE_CLOSE_EVENT, isHiddenConciergeRoute, type ConciergeOpenOptions } from '@/lib/concierge-connector';
import { createConciergeClient, type ConciergeBootstrapOptions } from '@/lib/brand-concierge-client';
import { isForwardProgress } from '@/lib/assistance-policy';
import { buildJourneyContext } from '@/lib/journey-context';
import { getEvents, getSessionId } from '@/lib/tracking';

declare global {
  interface Window {
    alloy: ((...args: unknown[]) => Promise<unknown>) & { q?: unknown[] };
    __alloyNS?: string[];
    styleConfiguration?: object;
    adobe: { concierge: { bootstrap: (options: ConciergeBootstrapOptions) => void | Promise<void> } };
  }
}

export default function BrandConcierge() {
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ReturnType<typeof createConciergeClient> | null>(null);
  const pathname = usePathname();
  const chatAvailable = pathname !== '/demo/live' && adobeConnector.supportsBrand(brandIdForPath(pathname));
  const [initializeClient, setInitializeClient] = useState(chatAvailable);

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

    async function initialize() {
      await loadScript('/style-config-Nitin2adobe.js');
      if (!active) return;
      if (!window.alloy) {
        (window.__alloyNS = window.__alloyNS || []).push('alloy');
        const alloy: Window['alloy'] = (...args) => new Promise((resolve, reject) => {
          alloy.q!.push([resolve, reject, args]);
        });
        alloy.q = [];
        window.alloy = alloy;
      }
      await loadScript('https://cdn1.adoberesources.net/alloy/2.35.1/alloy.min.js');
      if (!active) return;
      await loadScript('https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js');
      if (!active) return;
      await window.alloy('configure', {
        defaultConsent: 'in',
        edgeDomain: 'edge.adobedc.net',
        edgeBasePath: 'ee',
        datastreamId: '1ccf8a78-69d5-40e7-a44a-a02edc1631a0',
        orgId: 'B4A122FD69126FF30A495FB9@AdobeOrg',
        debugEnabled: true,
        idMigrationEnabled: false,
        thirdPartyCookiesEnabled: false,
        prehidingStyle: '.personalization-container { opacity: 0 !important }',
        conversation: { region: 'va7' },
      });
      if (!active) return;
      await window.alloy('sendEvent', {});
    }

    const ready = initialize();
    const client = createConciergeClient({
      ready,
      mount,
      bootstrap: onEvent => window.adobe.concierge.bootstrap({
        instanceName: 'alloy',
        stylingConfigurations: window.styleConfiguration,
        selector: '#brand-concierge-mount',
        onEvent,
      }),
      canOpen: initialMessage => {
        if (!active || !isOpenRef.current || window.location.pathname === '/demo/live' || !adobeConnector.supportsBrand(brandIdForPath(window.location.pathname))) return false;
        if (!initialMessage) return true;
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
      client.dispose();
      if (clientRef.current === client) clientRef.current = null;
      scripts.forEach((script) => script.remove());
    };
  }, [initializeClient]);

  const openChat = (initialMessage?: string) => {
    isOpenRef.current = true;
    setIsOpen(true);
    const client = clientRef.current;
    if (!client) {
      console.error('Adobe Brand Concierge is not initialized.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    client.open(initialMessage).then(opened => {
      if (clientRef.current !== client) return;
      if (opened) setStatus('ready');
      else {
        isOpenRef.current = false;
        setIsOpen(false);
      }
    }, error => {
      if (clientRef.current !== client) return;
      console.error('Unable to open Adobe Brand Concierge:', error);
      setStatus('error');
    });
  };
  const openChatRef = useRef(openChat);
  openChatRef.current = openChat;

  const closeChat = () => {
    isOpenRef.current = false;
    setIsOpen(false);
    window.dispatchEvent(new Event(CONCIERGE_CLOSE_EVENT));
    launcherRef.current?.focus();
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      if (window.location.pathname === '/demo/live' || !adobeConnector.supportsBrand(brandIdForPath(window.location.pathname))) return;
      event.preventDefault();
      const options = event instanceof CustomEvent ? event.detail as ConciergeOpenOptions | undefined : undefined;
      openChatRef.current(typeof options?.initialMessage === 'string' ? options.initialMessage : undefined);
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONCIERGE_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!chatAvailable) {
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
        onClick={() => isOpen ? closeChat() : openChat()}
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