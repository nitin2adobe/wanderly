import type { createSignalCollector } from './collector.ts';

type Collector = Pick<ReturnType<typeof createSignalCollector>, 'ingest'>;
type LayerListener = (event: unknown) => void;
export type DataLayer = unknown[] & {
  addEventListener?: (name: string, listener: LayerListener) => void;
  removeEventListener?: (name: string, listener: LayerListener) => void;
};
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Reads configured identifiers only; never reads an input's value or surrounding DOM text. */
export function readAttributeSignal(element: Pick<Element, 'getAttribute'>): { name: string; payload: Record<string, unknown> } | undefined {
  const name = element.getAttribute('data-aaa-event');
  if (!name) return undefined;
  const payload: Record<string, unknown> = {};
  for (const [attribute, key] of [
    ['entity-ids', 'entityIds'], ['entity-type', 'entityType'], ['topic-id', 'topicId'],
    ['facet-id', 'facetId'], ['value-ids', 'valueIds'], ['phase', 'phase'], ['flow-id', 'flowId'], ['step-id', 'stepId'],
  ]) {
    const value = element.getAttribute(`data-aaa-${attribute}`);
    if (value !== null) payload[key] = attribute.endsWith('-ids') ? value.split(',').map(id => id.trim()).filter(Boolean) : value;
  }
  return { name, payload };
}

export function connectDataLayer(layer: DataLayer, collector: Collector, invalid: () => void = () => {}): () => void {
  const receive = (entry: unknown) => {
    if (typeof entry === 'function') return;
    if (!isRecord(entry) || typeof entry.event !== 'string') { invalid(); return; }
    // Unknown host events are not AAA errors; only events named in signalMap are sent by the host.
    collector.ingest('acdl', entry.event, entry);
  };
  if (layer.addEventListener) {
    layer.addEventListener('adobeDataLayer:event', receive);
    return () => layer.removeEventListener?.('adobeDataLayer:event', receive);
  }
  // Queued commands also work if the real ACDL library is installed after this adapter.
  const original = layer.push;
  let attached: DataLayer | undefined;
  function attach(api: DataLayer) {
    if (attached || !api?.addEventListener) return;
    attached = api;
    if (layer.push === push) layer.push = original;
    api.addEventListener('adobeDataLayer:event', receive);
  }
  function push(...entries: unknown[]) {
    const length = original.apply(layer, entries);
    for (const entry of entries) receive(entry);
    return length;
  }
  for (const entry of [...layer]) receive(entry);
  layer.push = push;
  layer.push(attach);
  return () => {
    if (layer.push === push) layer.push = original;
    attached?.removeEventListener?.('adobeDataLayer:event', receive);
    const index = layer.indexOf(attach);
    if (index >= 0) layer.splice(index, 1);
  };
}

export function connectAttributeSignals(document: Document, collector: Collector): () => void {
  const receive = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-aaa-event]') : null;
    if (!target) return;
    const configured = target.getAttribute('data-aaa-on') ?? 'click';
    if (configured !== event.type) return;
    const input = readAttributeSignal(target);
    if (input) collector.ingest('data-attribute', input.name, input.payload);
  };
  const types = ['click', 'change', 'submit'];
  for (const type of types) document.addEventListener(type, receive, true);
  return () => { for (const type of types) document.removeEventListener(type, receive, true); };
}
