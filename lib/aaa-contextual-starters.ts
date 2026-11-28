import type { ContextualStarterResult } from '../aaa/contracts/contextual/types.ts';
import { validateContract } from '../aaa/contracts/validate.ts';

export type ContextualStarters = ContextualStarterResult;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const source = (value: unknown): value is 'generated' | 'approved' => value === 'generated' || value === 'approved';
export function validContextualText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && !!value.trim() && Array.from(value).length <= limit
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateContextualStarters(value: unknown): ContextualStarters | undefined {
  if (!isRecord(value) || value.schemaVersion !== 'aaa-contextual-starters-1') return;
  const result = validateContract('StarterResult', value.result);
  if (!result.valid || result.value.starters.some(starter => !validContextualText(starter.text, 200))
    || !Array.isArray(value.starterProvenance)) return;
  const cleaned = { ...value };
  if (!isRecord(value.headline) || !validContextualText(value.headline.text, 120) || !source(value.headline.source)) delete cleaned.headline;
  if (!validContextualText(value.intentSummary, 200)) delete cleaned.intentSummary;
  const validated = validateContract('ContextualStarterResult', cleaned);
  if (!validated.valid || validated.value.starterProvenance.length !== result.value.starters.length
    || new Set(result.value.starters.map(starter => starter.starterId)).size !== result.value.starters.length
    || validated.value.starterProvenance.some((entry, index) => entry.starterId !== result.value.starters[index].starterId)) return;
  return validated.value;
}
