/**
 * GET /api/availability: the bookable slots for /talktome, read from the
 * "Bookable time" events in Google Calendar over the next 90 days.
 */
import type { Availability } from '../../src/data/talk-availability.ts';
import { listBookableSlots, readConfig } from '../lib/google-calendar.ts';

// Availability changes as people book, so nothing should hold on to it.
const noStore = { 'cache-control': 'no-store' };

export default async function availability(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  try {
    const body: Availability = { slots: await listBookableSlots(readConfig(process.env)) };
    return Response.json(body, { headers: noStore });
  } catch (error) {
    // The detail goes to the function log only. The browser gets nothing
    // about credentials or Google's responses.
    console.error('GET /api/availability failed:', error);
    return Response.json(
      { error: 'Availability is unavailable right now.' },
      { status: 502, headers: noStore },
    );
  }
}

// Netlify routes this path to the function, so no redirect rule is needed.
export const config = { path: '/api/availability' };
