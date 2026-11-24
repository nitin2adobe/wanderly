import type { WanderlyEvent } from './events.ts';

export type InvitationOutcome = {
  assistanceType: string;
  source: string;
  response: 'AUTO_TRIGGERED' | 'ACCEPTED' | 'DISMISSED' | 'WITHDRAWN' | 'NO_RESPONSE' | 'OPENED' | 'FAILED' | 'CANCELLED';
  priority?: string;
  progressedAfter: boolean;
  activationId?: string;
  queryCount?: number;
  completedResponses?: number;
};
const PROGRESS = ['DATE_SEARCH', 'BOOKING_START', 'BOOKING_STEP', 'BOOKING_COMPLETE'];

/** Progression is correlation, never proof that assistance caused it. Supports older event histories. */
export function summariseOutcomes(sessionEvents: WanderlyEvent[]): InvitationOutcome[] {
  const outcomes: InvitationOutcome[] = [];
  const seen = new Set<string>();
  sessionEvents.forEach((event, index) => {
    if (event.eventType !== 'ASSISTANCE_SHOWN' && event.eventType !== 'ASSISTANCE_REQUESTED') return;
    const activationId = typeof event.metadata?.activationId === 'string' ? event.metadata.activationId : undefined;
    if (activationId && seen.has(activationId)) return;
    if (activationId) seen.add(activationId);
    const assistanceType = String(event.metadata?.assistanceType ?? 'UNKNOWN');
    const later = sessionEvents.slice(index + 1);
    const next = later.findIndex(item => item.eventType === 'ASSISTANCE_SHOWN');
    const window = activationId ? later.filter(item => item.metadata?.activationId === activationId) : next === -1 ? later : later.slice(0, next);
    const matches = (item: WanderlyEvent) => item.metadata?.assistanceType === assistanceType;
    const response = window.find(item => matches(item) && item.eventType === 'ASSISTANCE_DISMISSED') ??
      window.find(item => matches(item) && item.eventType === 'ASSISTANCE_ACCEPTED') ??
      window.find(item => matches(item) && item.eventType === 'ASSISTANCE_TRIGGERED') ??
      window.find(item => matches(item) && item.eventType === 'ASSISTANCE_OPENED') ??
      window.find(item => matches(item) && (item.eventType === 'ASSISTANCE_FAILED' || item.eventType === 'ASSISTANCE_CANCELLED'));
    const preference = window.filter(item => item.eventType === 'ASSISTANCE_PREFERENCE').at(-1);
    outcomes.push({
      assistanceType, source: String(event.metadata?.source ?? 'unknown'),
      response: !response ? 'NO_RESPONSE'
        : response.eventType === 'ASSISTANCE_TRIGGERED' ? 'AUTO_TRIGGERED'
        : response.eventType === 'ASSISTANCE_OPENED' ? 'OPENED'
        : response.eventType === 'ASSISTANCE_FAILED' ? 'FAILED'
        : response.eventType === 'ASSISTANCE_CANCELLED' ? 'CANCELLED'
        : response.eventType === 'ASSISTANCE_ACCEPTED' ? 'ACCEPTED'
        : response.metadata?.reason === 'withdrawn' ? 'WITHDRAWN' : 'DISMISSED',
      priority: preference?.metadata?.priority as string | undefined,
      progressedAfter: later.some(item => PROGRESS.includes(item.eventType)),
      ...(activationId ? {
        activationId,
        queryCount: window.filter(item => item.eventType === 'ASSISTANCE_QUERY_SUBMITTED').length,
        completedResponses: window.filter(item => item.eventType === 'ASSISTANCE_RESPONSE_COMPLETED').length,
      } : {}),
    });
  });
  return outcomes;
}

export function conciergeMetrics(events: WanderlyEvent[]) {
  const unique = (type: WanderlyEvent['eventType']) => new Set(events.filter(event => event.eventType === type).map(event => String(event.metadata?.activationId ?? event.id))).size;
  const streamingTimes = events.filter(event => event.eventType === 'ASSISTANCE_RESPONSE_COMPLETED').map(event => event.metadata?.responseMs).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return {
    requested: unique('ASSISTANCE_REQUESTED'),
    opened: unique('ASSISTANCE_OPENED'),
    openingFailures: events.filter(event => event.eventType === 'ASSISTANCE_FAILED' && event.metadata?.phase === 'opening').length,
    serviceErrors: events.filter(event => event.eventType === 'ASSISTANCE_FAILED' && event.metadata?.phase === 'service').length,
    cancelled: unique('ASSISTANCE_CANCELLED'),
    queries: events.filter(event => event.eventType === 'ASSISTANCE_QUERY_SUBMITTED').length,
    completedResponses: events.filter(event => event.eventType === 'ASSISTANCE_RESPONSE_COMPLETED').length,
    positiveFeedback: events.filter(event => event.eventType === 'ASSISTANCE_FEEDBACK' && event.metadata?.feedback === 'positive').length,
    negativeFeedback: events.filter(event => event.eventType === 'ASSISTANCE_FEEDBACK' && event.metadata?.feedback === 'negative').length,
    averageStreamingMs: streamingTimes.length ? Math.round(streamingTimes.reduce((sum, value) => sum + value, 0) / streamingTimes.length) : null,
  };
}
