/**
 * Cancels a /talktome booking by turning the same Google Calendar event back
 * into a "Bookable time" slot, wiping everything the booking added.
 *
 * Server-side only. The cancel token is a secret link: never log it.
 */
import { timingSafeEqual } from 'node:crypto';

import {
  accessToken,
  BOOKABLE_TITLE,
  type CalendarEvent,
  eventsUrl,
  type Fetch,
  GoogleCalendarError,
  type GoogleConfig,
} from './google-calendar.ts';

/**
 * The link is wrong, used, expired, or the booking can't be cancelled any
 * more. Deliberately one error for all of these, so a caller can't tell
 * whether an event exists.
 */
export class InvalidCancellationError extends Error {
  name = 'InvalidCancellationError';
}

/** Someone changed the event between the check and the cancel (412). */
export class CancellationConflictError extends Error {
  name = 'CancellationConflictError';
}

export interface CancellationRequest {
  eventId: string;
  token: string;
}

const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export function validateCancellation(body: unknown): CancellationRequest | null {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const eventId = typeof input.eventId === 'string' ? input.eventId : '';
  const token = typeof input.token === 'string' ? input.token : '';
  return EVENT_ID.test(eventId) && TOKEN.test(token) ? { eventId, token } : null;
}

/** Compares in constant time, so response timing doesn't leak the token. */
function sameToken(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface BookedEvent extends CalendarEvent {
  etag?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * The patch that undoes a booking. In a Google PATCH, a field set to null is
 * deleted and an array is replaced, while anything left out is kept. So each
 * thing the booking added is named here explicitly, and start and end are
 * left out so they stay exactly as they are.
 */
export const RESTORE_PATCH = {
  summary: BOOKABLE_TITLE,
  description: null,
  attendees: [],
  conferenceData: null,
  extendedProperties: { private: { cancelToken: null } },
};

export async function cancelBooking(
  config: GoogleConfig,
  { eventId, token }: CancellationRequest,
  { fetch: fetchImpl = fetch, now = new Date() }: { fetch?: Fetch; now?: Date } = {},
): Promise<void> {
  const access = await accessToken(config, fetchImpl);
  const auth = { authorization: `Bearer ${access}` };
  const eventUrl = `${eventsUrl(config)}/${encodeURIComponent(eventId)}`;

  // 1. Read the event fresh and check the link still applies to it.
  const fields = 'id,etag,status,summary,start,end,extendedProperties';
  const current = await fetchImpl(`${eventUrl}?${new URLSearchParams({ fields })}`, { headers: auth });
  if (current.status === 404 || current.status === 410) throw new InvalidCancellationError();
  if (!current.ok) {
    throw new GoogleCalendarError(`Event request failed: ${current.status} ${await current.text()}`);
  }
  const event = (await current.json()) as BookedEvent;
  const start = event.start?.dateTime;
  if (
    event.status === 'cancelled' ||
    event.summary === BOOKABLE_TITLE ||
    !start ||
    Date.parse(start) <= now.getTime() ||
    !sameToken(event.extendedProperties?.private?.cancelToken, token)
  ) {
    throw new InvalidCancellationError();
  }

  // 2. Put it back to a bookable slot. If-Match means Google refuses (412)
  // if anything touched the event since step 1. sendUpdates tells the guest
  // they've been removed; conferenceDataVersion lets the Meet be removed.
  const params = new URLSearchParams({ sendUpdates: 'all', conferenceDataVersion: '1', fields: 'id' });
  const patched = await fetchImpl(`${eventUrl}?${params}`, {
    method: 'PATCH',
    headers: {
      ...auth,
      'content-type': 'application/json',
      ...(event.etag && { 'if-match': event.etag }),
    },
    body: JSON.stringify(RESTORE_PATCH),
  });
  if (patched.status === 412) throw new CancellationConflictError();
  if (!patched.ok) {
    throw new GoogleCalendarError(`Event restore failed: ${patched.status} ${await patched.text()}`);
  }
}
