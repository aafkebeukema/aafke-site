/**
 * POST /api/book: books one "Bookable time" slot from /talktome.
 *
 * Body (JSON): { slotId, name, email, phone?, note?, company_fax }, where company_fax
 * is the honeypot. Replies:
 *   200 { start, end, meetUrl? }  booked, invitation sent by Google. meetUrl is
 *                                 left out if Google was slow to create the Meet
 *   400 { error, fields? }        invalid input or a filled honeypot
 *   409 { error }                 the slot is no longer available
 *   502 { error }                 Google failed; nothing was confirmed
 */
import { bookSlot, SlotUnavailableError, validateBooking } from '../lib/booking.ts';
import { readConfig } from '../lib/google-calendar.ts';

const noStore = { 'cache-control': 'no-store' };
const reply = (status: number, body: object) => Response.json(body, { status, headers: noStore });

export default async function book(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  }
  // Requiring JSON means a browser on another site has to ask permission
  // first (a CORS preflight), which this function never grants.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return reply(415, { error: 'Expected JSON.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'Expected JSON.' });
  }

  const checked = validateBooking(body);
  if (!checked.ok) {
    return checked.reason === 'honeypot'
      ? reply(400, { error: 'The booking could not be made.' })
      : reply(400, { error: 'Please check the form.', fields: checked.fields });
  }

  try {
    // The cancellation link points back at whichever site took the booking.
    const origin = new URL(request.url).origin;
    return reply(
      200,
      await bookSlot(readConfig(process.env), checked.booking, origin, { notifyEmail: notifyEmail() }),
    );
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      return reply(409, { error: 'Sorry, that time has just gone. Please choose another.' });
    }
    // Logs Google's error only, never the booker's details.
    console.error('POST /api/book failed:', error);
    return reply(502, { error: 'The booking could not be made.' });
  }
}

/**
 * BOOKING_NOTIFY_EMAIL, if set, is added as a hidden guest on every booking so
 * Aafke gets the invitation (and later the cancellation) in her own inbox. It
 * lives in Netlify settings to keep the address out of the public repo.
 */
function notifyEmail(): string | undefined {
  const email = process.env.BOOKING_NOTIFY_EMAIL?.trim();
  return email && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : undefined;
}

export const config = { path: '/api/book' };
