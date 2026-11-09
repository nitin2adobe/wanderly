import type { WanderlyEvent } from './events.ts';

export type InvitationOutcome = {
  assistanceType: string;
  source: string;
  response: 'ACCEPTED' | 'DISMISSED' | 'WITHDRAWN' | 'NO_RESPONSE';
  priority?: string;
  /** Visitor searched dates or started booking after the invitation was shown. */
  progressedAfter: boolean;
};

const PROGRESS = ['DATE_SEARCH', 'BOOKING_START', 'BOOKING_STEP', 'BOOKING_COMPLETE'];

/**
 * Summarises what happened to each invitation. Progression after an invitation is
 * correlation, not proof that the invitation caused it.
 */
export function summariseOutcomes(sessionEvents: WanderlyEvent[]): InvitationOutcome[] {
  const outcomes: InvitationOutcome[] = [];
  sessionEvents.forEach((event, index) => {
    if (event.eventType !== 'ASSISTANCE_SHOWN') return;
    const assistanceType = String(event.metadata?.assistanceType ?? 'UNKNOWN');
    const later = sessionEvents.slice(index + 1);
    const next = later.findIndex(e => e.eventType === 'ASSISTANCE_SHOWN');
    const window = next === -1 ? later : later.slice(0, next);
    const response = window.find(e => (e.eventType === 'ASSISTANCE_ACCEPTED' || e.eventType === 'ASSISTANCE_DISMISSED') && e.metadata?.assistanceType === assistanceType);
    const preference = window.filter(e => e.eventType === 'ASSISTANCE_PREFERENCE').at(-1);
    outcomes.push({
      assistanceType,
      source: String(event.metadata?.source ?? 'unknown'),
      response: !response ? 'NO_RESPONSE'
        : response.eventType === 'ASSISTANCE_ACCEPTED' ? 'ACCEPTED'
        : response.metadata?.reason === 'withdrawn' ? 'WITHDRAWN' : 'DISMISSED',
      priority: preference?.metadata?.priority as string | undefined,
      progressedAfter: later.some(e => PROGRESS.includes(e.eventType)),
    });
  });
  return outcomes;
}
