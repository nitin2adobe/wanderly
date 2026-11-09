import type { ConciergeHandoff } from './concierge-handoff.ts';

/**
 * Integration boundary between the activation plugin and a brand's concierge.
 * A real brand implements `open` to start its own concierge with the handoff context;
 * the plugin never depends on how the concierge renders or converses.
 */
export type ConciergeConnector = {
  readonly name: string;
  open(handoff: ConciergeHandoff): void;
};

export const CONCIERGE_OPEN_EVENT = 'wanderly:concierge-open';

/** Demo connector: asks the bundled mock concierge panel to open. */
export const demoConnector: ConciergeConnector = {
  name: 'wanderly-demo-concierge',
  open(handoff) {
    window.dispatchEvent(new CustomEvent<ConciergeHandoff>(CONCIERGE_OPEN_EVENT, { detail: handoff }));
  },
};
