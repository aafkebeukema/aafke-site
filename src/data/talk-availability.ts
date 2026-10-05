/**
 * What the /talktome page and GET /api/availability share. Slots come from
 * "Bookable time" events in Google Calendar (netlify/lib/google-calendar.ts).
 */

/** The meeting length shown on the page. Each slot's own end time is used for booking. */
export const MEETING_MINUTES = 25;

/** One bookable slot. Start and end are ISO 8601, in UTC. */
export interface AvailableSlot {
  id: string;
  start: string;
  end: string;
}

/** The body of GET /api/availability. */
export interface Availability {
  slots: AvailableSlot[];
  /** Where the window ends (exclusive). Nothing on or after this was looked at. */
  until: string;
}
