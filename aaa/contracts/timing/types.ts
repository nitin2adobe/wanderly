import type { PageRef, StarterRequest } from '../types.ts';

export type TimingPointKind = 'page_settled' | 'activity_paused' | 'long_stay' | 'revisit';
export type TimingPoint = { kind: TimingPointKind; sequence: number; pageSequence: number };
export type MomentRequest = {
  schemaVersion: 'aaa-moment-request-1';
  request: StarterRequest;
  decisionPoint: TimingPoint;
  exposure: { shownThisSession: number };
};
export type TimingJudgments = { welcomeNow: 'yes' | 'no' | 'unsure'; makingProgress: 'yes' | 'no' | 'unsure'; stuck: 'yes' | 'no' | 'unsure' };
export type MomentResult = {
  schemaVersion: 'aaa-moment-result-1';
  requestId: string; sessionId: string; page: PageRef; decisionPoint: TimingPoint;
  decision: 'assist' | 'silent'; source: 'agent' | 'safeguard' | 'agent.failed';
  judgments?: TimingJudgments; modelRecommendation?: 'assist' | 'silent'; confidence?: 'low' | 'medium' | 'high';
  reasonCodes: string[]; assertiveness: 'gentle' | 'default' | 'eager'; expiresAt: string; traceId: string;
};
