'use client';
import type { BrandAdapter } from './brand-adapters.ts';
import { track } from './tracking';

/** Translates a brand's own event through its adapter and records it in the shared event stream. */
export function trackAdapted<Raw>(adapter: BrandAdapter<Raw>, raw: Raw, page: string) {
  const mapped = adapter.toEvent(raw);
  if (mapped) track(mapped.eventType, page, mapped.entity);
}
