/**
 * How /talktome reads a POST /api/book reply. Kept apart from the page so it
 * can be tested without a browser.
 */

export type BookingOutcome = { booked: true; meetUrl: string | null } | { booked: false };

/**
 * Any 2xx means Google has booked the event, so the confirmation shows even
 * without a Meet link. A link is only used if it really is a Meet address.
 */
export function readBookingResponse(ok: boolean, body: unknown): BookingOutcome {
  if (!ok) return { booked: false };
  const meetUrl = (body as { meetUrl?: unknown } | null)?.meetUrl;
  return { booked: true, meetUrl: isMeetUrl(meetUrl) ? meetUrl : null };
}

function isMeetUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com';
  } catch {
    return false;
  }
}
