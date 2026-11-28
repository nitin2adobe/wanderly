import type { CanonicalSignal, PageRef, SignalSource, SiteProfile } from './contracts/types.ts';
import { validateContract } from './contracts/validate.ts';

export type CollectorContext = PageRef & { sessionId: string; locale: string };
export type SignalDiagnostic = { code: 'signal.disabled' | 'signal.unmapped' | 'signal.ambiguous' | 'signal.invalid' | 'signal.undeclared' | 'signal.capacity'; source: SignalSource };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const pathValue = (value: unknown, path: string): unknown => {
  for (const key of path.split('.')) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !record(value) || !Object.hasOwn(value, key)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return undefined;
    value = descriptor.value;
  }
  return value;
};

/** Mapping is allowlisted by the profile; IDs/timestamps/revisions always come from the host. */
export function createSignalCollector(options: {
  profile: SiteProfile;
  context: () => CollectorContext | undefined;
  enabled: () => boolean;
  now?: () => number;
  makeId?: () => string;
  initial?: CanonicalSignal[];
  onSignal?: (signal: CanonicalSignal) => void;
  diagnostic?: (diagnostic: SignalDiagnostic) => void;
}) {
  const signals: CanonicalSignal[] = [...(options.initial ?? [])];
  let seq = signals.at(-1)?.seq ?? 0;
  let lastSession = signals.at(-1)?.sessionId;
  let full = false;
  const reject = (code: SignalDiagnostic['code'], source: SignalSource) => { options.diagnostic?.({ code, source }); return undefined; };
  function ingest(source: SignalSource, name: string, payload: unknown = {}): CanonicalSignal | undefined {
    if (!options.enabled()) return reject('signal.disabled', source);
    const context = options.context();
    if (!context) return reject('signal.disabled', source);
    if (lastSession !== context.sessionId) { signals.length = 0; seq = 0; full = false; lastSession = context.sessionId; }
    const mappings = options.profile.signalMap.filter(mapping => mapping.source === source && mapping.match === name);
    if (mappings.length !== 1) return reject(mappings.length ? 'signal.ambiguous' : 'signal.unmapped', source);
    if (signals.length >= 300) { full = true; return reject('signal.capacity', source); }
    const mapping = mappings[0];
    const fields: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(mapping.fields ?? {})) {
      const value = typeof spec === 'string' ? pathValue(payload, spec) : spec.value;
      if (value !== undefined) {
        const valid = key === 'entityIds' || key === 'valueIds'
          ? Array.isArray(value) && value.every(item => typeof item === 'string')
          : typeof value === 'string';
        if (!valid) return reject('signal.invalid', source);
        fields[key] = value;
      }
    }
    const { entityIds = [], ...attributes } = fields;
    const value: unknown = {
      schemaVersion: '1.0.0', signalId: (options.makeId ?? (() => crypto.randomUUID()))(), kind: mapping.kind,
      ...context, seq: seq + 1, ts: new Date((options.now ?? Date.now)()).toISOString(),
      profileId: options.profile.profileId, profileVersion: options.profile.profileVersion,
      entityIds, provenance: mapping.provenance, source, attributes,
    };
    const validated = validateContract('CanonicalSignal', value);
    if (!validated.valid) return reject('signal.invalid', source);
    const signal = validated.value;
    const profile = options.profile;
    if (!profile.locales.supported.includes(signal.locale) || !profile.taxonomy.pageTypes.some(item => item.id === signal.pageType)
      || (signal.kind === 'entity.viewed' || signal.kind === 'entity.compared') && !profile.taxonomy.entityTypes.some(item => item.id === signal.attributes.entityType)
      || signal.kind === 'info.sought' && !profile.taxonomy.topics.some(item => item.id === signal.attributes.topicId)
      || signal.kind === 'facet.selected' && !profile.facets.some(facet => facet.id === signal.attributes.facetId && signal.attributes.valueIds.every(id => facet.values.some(value => value.id === id)))) {
      return reject('signal.undeclared', source);
    }
    const copied = structuredClone(signal);
    signals.push(copied);
    seq++;
    options.onSignal?.(structuredClone(copied));
    return structuredClone(copied);
  }
  return {
    ingest,
    track: (name: string, payload?: Record<string, unknown>) => ingest('track', name, payload),
    signals: () => structuredClone(signals),
    incomplete: () => full,
  };
}
