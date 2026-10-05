/**
 * GET /api/availability: the bookable slots for /talktome.
 *
 * Still mocked. Later this asks Google Calendar for free time instead, and the
 * response shape stays the same so the page does not need to change.
 */
import { mockAvailability } from '../../src/data/talk-availability.ts';

export default async function availability(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  // Availability changes as people book, so nothing should hold on to it.
  return Response.json(mockAvailability(), { headers: { 'cache-control': 'no-store' } });
}

// Netlify routes this path to the function, so no redirect rule is needed.
export const config = { path: '/api/availability' };
