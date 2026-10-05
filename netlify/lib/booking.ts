/**
 * Books a "Bookable time" slot by turning that same Google Calendar event into
 * the meeting: new title, the booker as an attendee, a Google Meet, and the
 * details in the description. Google sends the invitation.
 *
 * Server-side only. Nothing here should log what the booker typed.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import {
  accessToken,
  type CalendarEvent,
  eventsUrl,
  type Fetch,
  GoogleCalendarError,
  type GoogleConfig,
  isBookable,
} from './google-calendar.ts';

/** The booked event's title, as Aafke chose it. */
export const bookedTitle = (name: string) => `${name} : Aafke - Chat`;

export interface BookingRequest {
  slotId: string;
  name: string;
  email: string;
  phone?: string;
  note?: string;
}

/** The slot is gone, retitled, past, or someone else got there first. */
export class SlotUnavailableError extends Error {
  name = 'SlotUnavailableError';
}

/**
 * What the page needs once a booking has gone through. meetUrl is missing
 * only when Google was slow to create the Meet; the invitation carries it.
 */
export interface BookingResult {
  start: string;
  end: string;
  meetUrl?: string;
}

// ---------------------------------------------------------------- validation

const LIMITS = { name: 100, email: 254, phone: 40, note: 2000 };
// Google event ids are letters, digits and underscores (recurring instances
// add _YYYYMMDDTHHMMSSZ). Anything else is not a slot id.
const SLOT_ID = /^[A-Za-z0-9_-]{1,1024}$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
// Control characters would break the title line or the description layout.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LINE_BREAK = /[\r\n]/;

export type Validation =
  | { ok: true; booking: BookingRequest }
  | { ok: false; reason: 'honeypot' }
  | { ok: false; reason: 'invalid'; fields: Record<string, string> };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Checks a submitted body. Messages match the ones the page shows itself. */
export function validateBooking(body: unknown): Validation {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  // A person never sees this field, so anything in it means a bot. The name
  // is one that browsers and password managers have no reason to fill.
  if (text(input.company_fax)) return { ok: false, reason: 'honeypot' };

  const slotId = text(input.slotId);
  const name = text(input.name);
  const email = text(input.email);
  const phone = text(input.phone);
  const note = text(input.note);
  const fields: Record<string, string> = {};

  if (!SLOT_ID.test(slotId)) fields.slotId = 'Please choose a time.';

  if (!name) fields.name = 'Please add your name.';
  else if (name.length > LIMITS.name || CONTROL.test(name) || LINE_BREAK.test(name)) {
    fields.name = 'Please check your name.';
  }

  if (!email) fields.email = 'Please add your email address.';
  else if (email.length > LIMITS.email || !EMAIL.test(email)) {
    fields.email = "That doesn't look like an email address.";
  }

  if (phone.length > LIMITS.phone || CONTROL.test(phone) || LINE_BREAK.test(phone)) {
    fields.phone = 'Please check your phone number.';
  }
  if (note.length > LIMITS.note || CONTROL.test(note)) {
    fields.note = 'Please shorten your message.';
  }

  if (Object.keys(fields).length) return { ok: false, reason: 'invalid', fields };
  return {
    ok: true,
    booking: { slotId, name, email, ...(phone && { phone }), ...(note && { note }) },
  };
}

// ------------------------------------------------------------------- booking

/** 256 bits. A fresh one for every booking, so an old link never works again. */
export const newCancelToken = () => randomBytes(32).toString('base64url');

/**
 * The guest's cancellation link. It is a secret: anyone holding it can cancel,
 * so it goes only into the event, never into a log. The origin is the site the
 * booking came through, so branch deploys link to themselves.
 */
export function cancelUrl(origin: string, eventId: string, token: string): string {
  const url = new URL('/talktome/cancel', origin);
  url.search = new URLSearchParams({ eventId, token }).toString();
  return url.href;
}

function description(booking: BookingRequest, cancelLink: string): string {
  const lines = [`Name: ${booking.name}`, `Email: ${booking.email}`];
  if (booking.phone) lines.push(`Phone: ${booking.phone}`);
  if (booking.note) lines.push('', 'What they would like to chat about:', booking.note);
  lines.push('', `Need to cancel? ${cancelLink}`);
  lines.push('', 'Booked through aafke.co.uk/talktome');
  return lines.join('\n');
}

type Guest = { email?: string; displayName?: string };

/** Adds guests, skipping anyone already invited (e.g. Aafke booking herself to test). */
function withGuests(existing: Guest[], added: Guest[]): Guest[] {
  const guests = [...existing];
  const seen = new Set(existing.map((guest) => guest.email?.toLowerCase()));
  for (const guest of added) {
    const key = guest.email?.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    guests.push(guest);
  }
  return guests;
}

interface MeetEvent extends CalendarEvent {
  etag?: string;
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
}

const meetUrl = (event: MeetEvent) =>
  event.hangoutLink ??
  event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri;

const MEET_CHECKS = 3;
const MEET_WAIT_MS = 700;

export async function bookSlot(
  config: GoogleConfig,
  booking: BookingRequest,
  origin: string,
  {
    fetch: fetchImpl = fetch,
    now = new Date(),
    cancelToken = newCancelToken(),
    wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    notifyEmail,
  }: {
    fetch?: Fetch;
    now?: Date;
    cancelToken?: string;
    wait?: (ms: number) => Promise<void>;
    /** Aafke's own address, added as a hidden extra guest so she hears about every booking. */
    notifyEmail?: string;
  } = {},
): Promise<BookingResult> {
  const token = await accessToken(config, fetchImpl);
  const auth = { authorization: `Bearer ${token}` };
  const eventUrl = `${eventsUrl(config)}/${encodeURIComponent(booking.slotId)}`;
  const fields = 'id,etag,status,summary,start,end,attendees,extendedProperties,hangoutLink,conferenceData';

  // 1. Fetch the event fresh and check it can still be booked.
  const current = await fetchImpl(`${eventUrl}?${new URLSearchParams({ fields })}`, { headers: auth });
  if (current.status === 404 || current.status === 410) {
    throw new SlotUnavailableError('The event no longer exists');
  }
  if (!current.ok) {
    throw new GoogleCalendarError(`Event request failed: ${current.status} ${await current.text()}`);
  }
  const event = (await current.json()) as MeetEvent & {
    attendees?: { email?: string }[];
    extendedProperties?: { private?: Record<string, string> };
  };
  if (!isBookable(event, now)) throw new SlotUnavailableError('The event is no longer bookable');

  // 2. Turn it into the meeting. If-Match makes Google refuse the change
  // (412) if anything touched the event since step 1, such as a second
  // booking landing a moment earlier. Start and end are not sent, so they
  // stay exactly as they are.
  const params = new URLSearchParams({ sendUpdates: 'all', conferenceDataVersion: '1', fields });
  const patched = await fetchImpl(`${eventUrl}?${params}`, {
    method: 'PATCH',
    headers: {
      ...auth,
      'content-type': 'application/json',
      ...(event.etag && { 'if-match': event.etag }),
    },
    body: JSON.stringify({
      summary: bookedTitle(booking.name),
      description: description(booking, cancelUrl(origin, booking.slotId, cancelToken)),
      attendees: withGuests(event.attendees ?? [], [
        { email: booking.email, displayName: booking.name },
        ...(notifyEmail ? [{ email: notifyEmail }] : []),
      ]),
      // The booker never sees who else is invited, so Aafke's address stays private.
      ...(notifyEmail && { guestsCanSeeOtherGuests: false }),
      conferenceData: {
        createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      extendedProperties: {
        private: { ...(event.extendedProperties?.private ?? {}), cancelToken },
      },
    }),
  });
  if (patched.status === 412) throw new SlotUnavailableError('The event changed before it could be booked');
  if (!patched.ok) {
    throw new GoogleCalendarError(`Event update failed: ${patched.status} ${await patched.text()}`);
  }

  // From here the event is booked and Google has sent the invitation, so
  // nothing below may turn this into a failure or undo it.

  // 3. Google usually returns the Meet straight away, but may still be
  // creating it. Check back briefly; if it's still not there, the booking
  // stands without the link and the invitation carries it.
  let booked: MeetEvent = event;
  try {
    booked = (await patched.json()) as MeetEvent;
    for (let check = 0; !meetUrl(booked) && check < MEET_CHECKS; check++) {
      if (booked.conferenceData?.createRequest?.status?.statusCode === 'failure') break;
      await wait(MEET_WAIT_MS);
      const again = await fetchImpl(`${eventUrl}?${new URLSearchParams({ fields })}`, { headers: auth });
      if (!again.ok) break;
      booked = (await again.json()) as MeetEvent;
    }
  } catch (error) {
    console.warn('POST /api/book: booked, but could not read the Meet link:', error);
  }

  const url = meetUrl(booked);
  if (!url) console.warn(`POST /api/book: booked event ${booking.slotId} has no Meet link yet`);

  return {
    start: new Date(booked.start?.dateTime ?? event.start!.dateTime!).toISOString(),
    end: new Date(booked.end?.dateTime ?? event.end!.dateTime!).toISOString(),
    ...(url && { meetUrl: url }),
  };
}

