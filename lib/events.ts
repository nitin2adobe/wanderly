export type WanderlyEventType =
  | 'SESSION_START' | 'PAGE_VIEW' | 'DESTINATION_VIEW' | 'HOTEL_VIEW' | 'PACKAGE_VIEW'
  | 'COMPARE_ADD' | 'COMPARE_VIEW' | 'COMPARE_REMOVE' | 'DATE_SEARCH' | 'PRICE_VIEW'
  | 'TRAVEL_INFO_VIEW' | 'FAQ_SEARCH' | 'BOOKING_START' | 'BOOKING_STEP' | 'BOOKING_COMPLETE'
  | 'ASSISTANCE_SHOWN' | 'ASSISTANCE_ACCEPTED' | 'ASSISTANCE_DISMISSED';

export type WanderlyEvent = {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType: WanderlyEventType;
  page: string;
  entity?: string;
  metadata?: Record<string, unknown>;
};

export const EVENT_STORAGE_KEY = 'wanderly.events.v1';
export const SESSION_STORAGE_KEY = 'wanderly.session.v1';
export const EVENT_UPDATED = 'wanderly:event-updated';
