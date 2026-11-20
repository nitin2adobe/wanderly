export type ConciergeClientEvent = {
  eventType: string;
  data?: { query?: string };
};

export type ConciergeBootstrapOptions = {
  instanceName: string;
  stylingConfigurations?: object;
  selector: string;
  onEvent: (event: ConciergeClientEvent) => void;
};

/** Serializes initial-message bootstraps without replacing an ongoing conversation. */
export function createConciergeClient({
  ready,
  mount,
  bootstrap,
  canOpen,
}: {
  ready: Promise<void>;
  mount: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>;
  bootstrap: (onEvent: (event: ConciergeClientEvent) => void) => void | Promise<void>;
  canOpen: (initialMessage?: string) => boolean;
}) {
  let queue = Promise.resolve();
  let initialized = false;
  let hasConversation = false;
  let disposed = false;

  return {
    open(initialMessage?: string): Promise<boolean> {
      const request = queue.then(async () => {
        await ready;
        if (disposed || !canOpen(initialMessage)) return false;
        if (initialized && (!initialMessage || hasConversation)) return true;

        let submitted = false;
        if (initialMessage) mount.setAttribute('data-initial-message', initialMessage);
        try {
          await bootstrap(event => {
            if (event.eventType === 'query:submitted') {
              hasConversation = true;
              if (event.data?.query === initialMessage) submitted = true;
            } else if (event.eventType === 'history:cleared') {
              hasConversation = false;
            }
          });
          if (initialMessage && !submitted) {
            throw new Error('Adobe Brand Concierge did not submit the initial message.');
          }
          initialized = true;
          return true;
        } finally {
          // Do not replay the greeting on later SDK reinitializations.
          mount.removeAttribute('data-initial-message');
        }
      });
      // Each caller receives its rejection; a failed request must not poison the queue.
      queue = request.then(() => undefined, () => undefined);
      return request;
    },
    dispose() {
      disposed = true;
    },
  };
}
