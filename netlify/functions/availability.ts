/**
 * GET /api/availability: the bookable slots for /talktome, read from the
 * "Bookable time" events in Google Calendar, this month and the next four.
 */
import type { Availability } from '../../src/data/talk-availability.ts';
import { listBookableSlots, readConfig, type Timings, windowEnd } from '../lib/google-calendar.ts';

// Availability changes as people book, so nothing should hold on to it.
const noStore = { 'cache-control': 'no-store' };

export default async function availability(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  try {
    const timings: Timings = {};
    const now = new Date();
    const body: Availability = {
      slots: await listBookableSlots(readConfig(process.env), { now, timings }),
      until: windowEnd(now).toISOString(),
    };
    return Response.json(body, { headers: { ...noStore, 'server-timing': serverTiming(timings) } });
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

/** Durations only, so browser dev tools and curl can show where the time goes. */
function serverTiming({ token = 0, calendar = 0 }: Timings): string {
  return `token;dur=${token.toFixed(1)}, calendar;dur=${calendar.toFixed(1)}`;
}

// Netlify routes this path to the function, so no redirect rule is needed.
export const config = { path: '/api/availability' };
