'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    alloy: ((...args: unknown[]) => Promise<unknown>) & { q?: unknown[] };
    __alloyNS?: string[];
    styleConfiguration?: object;
    adobe: { concierge: { bootstrap: (options: object) => void } };
  }
}

export default function BrandConcierge() {
  useEffect(() => {
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
      window.alloy('configure', {
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
      window.alloy('sendEvent', {});
      window.adobe.concierge.bootstrap({
        instanceName: 'alloy',
        stylingConfigurations: window.styleConfiguration,
        selector: '#brand-concierge-mount',
        stickySession: false,
      });
    }

    initialize().catch(console.error);
    return () => {
      active = false;
      scripts.forEach((script) => script.remove());
    };
  }, []);

  return <div id="brand-concierge-mount" />;
}