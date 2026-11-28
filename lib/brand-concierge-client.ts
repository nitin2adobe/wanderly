export type ConciergeClientEvent = {
  eventType: string;
  timestamp?: number;
  data?: {
    query?: string;
    conversationId?: string;
    interactionId?: string;
    feedbackType?: string;
  };
};

export type ConciergeBootstrapOptions = {
  instanceName: string;
  stylingConfigurations?: object;
  selector: string;
  onEvent: (event: ConciergeClientEvent) => void;
};

export type ConciergeOpenResult = { status: 'opened' | 'submitted' | 'existing' | 'cancelled' };

function welcomeQuestions(question?: string, examples: readonly string[] = []): string[] {
  return [...new Set([question, ...examples].filter((value): value is string => !!value?.trim()).map(value => value.trim()))];
}

export function withConciergeSuggestion(configuration: object | undefined, question?: string, examples?: readonly string[]): object {
  const questions = welcomeQuestions(question, examples);
  if (!questions.length) return configuration ?? {};
  const arrays = configuration && 'arrays' in configuration && configuration.arrays && typeof configuration.arrays === 'object'
    ? configuration.arrays : {};
  return { ...configuration, arrays: { ...arrays, 'welcome.examples': questions.map(text => ({ text })) } };
}

export function createConciergeClient({
  ready, mount, bootstrap, canOpen, onEvent,
  legacyAutoSubmit = false, timeoutMs = 12_000,
}: {
  ready: Promise<void>;
  mount: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>;
  bootstrap: (onEvent: (event: ConciergeClientEvent) => void, question?: string, examples?: readonly string[]) => void | Promise<void>;
  canOpen: (initialMessage: string | undefined, automatic: boolean) => boolean;
  onEvent?: (event: ConciergeClientEvent) => void;
  legacyAutoSubmit?: boolean;
  timeoutMs?: number;
}) {
  let queue = Promise.resolve();
  let initialized = false;
  let configuredQuestion: string | undefined;
  let configuredExamples: string | undefined;
  let hasConversation = false;
  let disposed = false;
  let cancelActive: (() => void) | undefined;
  let blockedMessage: string | undefined;
  let cancellationEpoch = 0;

  return {
    open(initialMessage?: string, signal?: AbortSignal, allowAutoSubmit = true, examples?: readonly string[]): Promise<ConciergeOpenResult> {
      const questions = welcomeQuestions(undefined, examples);
      const examplesKey = JSON.stringify(welcomeQuestions(initialMessage, questions));
      const epoch = cancellationEpoch;
      const request = queue.then(() => new Promise<ConciergeOpenResult>((resolve, reject) => {
        let settled = false;
        let bootstrapping = false;
        const autoSubmit = legacyAutoSubmit && allowAutoSubmit && !!initialMessage;
        const finish = (result?: ConciergeOpenResult, error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal?.removeEventListener('abort', cancel);
          if (cancelActive === cancel) cancelActive = undefined;
          mount.removeAttribute('data-initial-message');
          // A timeout cannot prove that the SDK did not send. Never automatically replay this question.
          if (autoSubmit && bootstrapping && (error || result?.status === 'cancelled')) blockedMessage = initialMessage;
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new Error('Brand Concierge returned no opening result.'));
        };
        const cancel = () => finish({ status: 'cancelled' });
        const timeout = setTimeout(() => finish(undefined, new Error('Brand Concierge acknowledgement timed out. Reload or continue manually; do not automatically resend.')), timeoutMs);
        cancelActive = cancel;
        signal?.addEventListener('abort', cancel, { once: true });
        if (disposed || epoch !== cancellationEpoch || signal?.aborted || !canOpen(initialMessage, allowAutoSubmit)) { cancel(); return; }

        const receive = (event: ConciergeClientEvent) => {
          if (disposed) return;
          if (event.eventType === 'query:submitted') hasConversation = true;
          if (event.eventType === 'history:cleared') hasConversation = false;
          try { onEvent?.(event); }
          catch (error) { console.error('Unable to record Brand Concierge lifecycle:', error); }
          if (settled) return;
          if (epoch !== cancellationEpoch || signal?.aborted || !canOpen(initialMessage, allowAutoSubmit)) { cancel(); return; }
          if (event.eventType === 'error:occurred') {
            finish(undefined, new Error('Brand Concierge reported an SDK or service error.'));
          } else if (autoSubmit && event.eventType === 'query:submitted' && event.data?.query === initialMessage) {
            initialized = true;
            finish({ status: 'submitted' });
          } else if (!autoSubmit && event.eventType === 'webclient:initialized') {
            initialized = true;
            configuredQuestion = initialMessage;
            configuredExamples = examplesKey;
            finish({ status: 'opened' });
          }
        };

        ready.then(async () => {
          if (settled) return;
          if (disposed || epoch !== cancellationEpoch || signal?.aborted || !canOpen(initialMessage, allowAutoSubmit)) { cancel(); return; }
          if (initialized && (hasConversation || (!autoSubmit && initialMessage === configuredQuestion && examplesKey === configuredExamples))) { finish({ status: 'existing' }); return; }
          if (autoSubmit && blockedMessage === initialMessage) {
            finish(undefined, new Error('The previous submission has an unknown outcome. Continue in the existing chat instead of resending.'));
            return;
          }
          bootstrapping = true;
          if (autoSubmit) mount.setAttribute('data-initial-message', initialMessage);
          await bootstrap(receive, autoSubmit ? undefined : initialMessage, questions);
        }).catch(error => finish(undefined, error instanceof Error ? error : new Error('Brand Concierge bootstrap failed.')));
      }));
      queue = request.then(() => undefined, () => undefined);
      return request;
    },
    cancel() { cancellationEpoch++; cancelActive?.(); },
    dispose() { disposed = true; cancelActive?.(); },
  };
}
