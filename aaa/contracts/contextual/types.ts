import type { StarterResult } from '../types.ts';

export type ContextualStarterResultV1 = {
  schemaVersion: 'aaa-contextual-starters-1';
  result: StarterResult;
  starterProvenance: { starterId: string; source: 'generated' | 'approved' }[];
  headline?: { text: string; source: 'generated' | 'approved' };
  intentSummary?: string;
};

export type ContextualStarterResultV2 = Omit<ContextualStarterResultV1, 'schemaVersion' | 'intentSummary'> & {
  schemaVersion: 'aaa-contextual-starters-2';
  visitorBrief?: {
    text: string;
    slots: {
      stage: 'exploring' | 'comparing' | 'deciding' | 'transacting';
      entityIds: string[];
      priorities: string[];
      openQuestions: string[];
    };
    source: 'generated' | 'rendered';
  };
  why?: { text: string; factIds: string[] };
  rationale?: ('signal.back_and_forth' | 'signal.price_focus' | 'signal.info_seeking'
    | 'facet.explicit' | 'tool.evidence_changed_choice')[];
};

export type ContextualStarterResult = ContextualStarterResultV1 | ContextualStarterResultV2;
