/**
 * POST /api/cancel: cancels a /talktome booking from its cancellation link.
 *
 * Only POST does anything, so email clients and link scanners that open the
 * link can't cancel by accident. Body (JSON): { eventId, token }. Replies:
 *   200 { cancelled: true }  the event is a "Bookable time" slot again
 *   400 { error }            invalid, used or expired link (one message for all)
 *   409 { error }            the event changed meanwhile; try again
 *   502 { error }            Google failed; nothing was cancelled
 */
import {
  CancellationConflictError,
  cancelBooking,
  InvalidCancellationError,
  validateCancellation,
} from '../lib/cancellation.ts';
import { readConfig } from '../lib/google-calendar.ts';

const noStore = { 'cache-control': 'no-store' };
const reply = (status: number, body: object) => Response.json(body, { status, headers: noStore });
const invalid = () => reply(400, { error: 'This cancellation link is invalid or has expired.' });

export default async function cancel(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return reply(415, { error: 'Expected JSON.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid();
  }
  const cancellation = validateCancellation(body);
  if (!cancellation) return invalid();

  try {
    await cancelBooking(readConfig(process.env), cancellation);
    return reply(200, { cancelled: true });
  } catch (error) {
    if (error instanceof InvalidCancellationError) return invalid();
    if (error instanceof CancellationConflictError) {
      return reply(409, { error: 'The booking changed just now. Please try again.' });
    }
    // Google's error only. The token and event id are never logged.
    console.error('POST /api/cancel failed:', error);
    return reply(502, { error: 'The booking could not be cancelled.' });
  }
}

export const config = { path: '/api/cancel' };
