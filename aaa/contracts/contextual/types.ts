import type { StarterResult } from '../types.ts';

export type ContextualStarterResult = {
  schemaVersion: 'aaa-contextual-starters-1';
  result: StarterResult;
  starterProvenance: { starterId: string; source: 'generated' | 'approved' }[];
  headline?: { text: string; source: 'generated' | 'approved' };
  intentSummary?: string;
};
