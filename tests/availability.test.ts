import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import availability, { config } from '../netlify/functions/availability.ts';
import {
  type CalendarEvent,
  GoogleCalendarError,
  listBookableSlots,
  readConfig,
  toSlots,
} from '../netlify/lib/google-calendar.ts';

const now = new Date('2026-10-05T12:00:00Z');

const env = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REFRESH_TOKEN: 'refresh-token',
  GOOGLE_CALENDAR_ID: 'me@example.com',
};

const timed = (id: string, start: string, end: string, summary = 'Bookable time'): CalendarEvent => ({
  id,
  summary,
  status: 'confirmed',
  start: { dateTime: start },
  end: { dateTime: end },
});

/** A stand-in for Google: answers the token request, then serves event pages in order. */
function fakeGoogle(pages: { items: CalendarEvent[]; nextPageToken?: string }[]) {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.hostname === 'oauth2.googleapis.com') {
      return Response.json({ access_token: 'access-token', expires_in: 3599 });
    }
    return Response.json(pages.shift() ?? { items: [] });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

test('keeps only future, timed events titled exactly "Bookable time"', () => {
  const slots = toSlots(
    [
      timed('later', '2026-10-09T11:00:00+01:00', '2026-10-09T11:25:00+01:00'),
      timed('first', '2026-10-07T09:30:00+01:00', '2026-10-07T09:55:00+01:00'),
      timed('lowercase', '2026-10-08T10:00:00Z', '2026-10-08T10:25:00Z', 'bookable time'),
      timed('trailing-space', '2026-10-08T10:00:00Z', '2026-10-08T10:25:00Z', 'Bookable time '),
      timed('longer-title', '2026-10-08T10:00:00Z', '2026-10-08T10:25:00Z', 'Bookable time with Sam'),
      timed('past', '2026-10-05T09:00:00Z', '2026-10-05T09:25:00Z'),
      { ...timed('cancelled', '2026-10-08T10:00:00Z', '2026-10-08T10:25:00Z'), status: 'cancelled' },
      { id: 'all-day', summary: 'Bookable time', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } },
      { id: 'untitled', start: { dateTime: '2026-10-08T10:00:00Z' }, end: { dateTime: '2026-10-08T10:25:00Z' } },
    ],
    now,
  );

  assert.deepEqual(slots, [
    { id: 'first', start: '2026-10-07T08:30:00.000Z', end: '2026-10-07T08:55:00.000Z' },
    { id: 'later', start: '2026-10-09T10:00:00.000Z', end: '2026-10-09T10:25:00.000Z' },
  ]);
});

test("uses each event's own end time rather than a fixed length", () => {
  const [slot] = toSlots([timed('long', '2026-10-07T09:00:00Z', '2026-10-07T10:00:00Z')], now);
  assert.equal(slot.end, '2026-10-07T10:00:00.000Z');
});

test('swaps the refresh token for an access token, then asks for 90 days of single events', async () => {
  const google = fakeGoogle([{ items: [timed('a', '2026-10-07T09:30:00Z', '2026-10-07T09:55:00Z')] }]);
  const slots = await listBookableSlots(readConfig(env), { fetch: google.fetch, now });

  const [token, events] = google.requests;
  assert.equal(token.url.href, 'https://oauth2.googleapis.com/token');
  assert.equal(token.init?.method, 'POST');
  const form = new URLSearchParams(String(token.init?.body));
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('refresh_token'), 'refresh-token');
  assert.equal(form.get('client_id'), 'client-id');
  assert.equal(form.get('client_secret'), 'client-secret');

  assert.equal(events.url.pathname, '/calendar/v3/calendars/me%40example.com/events');
  assert.equal(new Headers(events.init?.headers).get('authorization'), 'Bearer access-token');
  const query = events.url.searchParams;
  assert.equal(query.get('timeMin'), '2026-10-05T12:00:00.000Z');
  assert.equal(query.get('timeMax'), '2027-01-03T12:00:00.000Z');
  assert.equal(query.get('singleEvents'), 'true');
  assert.equal(query.get('q'), 'Bookable time');

  assert.deepEqual(slots.map((slot) => slot.id), ['a']);
});

test('follows every page of results', async () => {
  const google = fakeGoogle([
    { items: [timed('a', '2026-10-07T09:30:00Z', '2026-10-07T09:55:00Z')], nextPageToken: 'page-2' },
    { items: [timed('b', '2026-10-08T09:30:00Z', '2026-10-08T09:55:00Z')] },
  ]);
  const slots = await listBookableSlots(readConfig(env), { fetch: google.fetch, now });

  assert.equal(google.requests[2].url.searchParams.get('pageToken'), 'page-2');
  assert.deepEqual(slots.map((slot) => slot.id), ['a', 'b']);
});

test("reports Google's error when the token is refused", async () => {
  const fetch = (async () =>
    Response.json({ error: 'invalid_grant' }, { status: 400 })) as typeof globalThis.fetch;
  await assert.rejects(
    listBookableSlots(readConfig(env), { fetch, now }),
    (error: Error) =>
      error instanceof GoogleCalendarError && /Token request failed: 400 .*invalid_grant/.test(error.message),
  );
});

test('names any missing environment variables', () => {
  assert.throws(
    () => readConfig({ GOOGLE_CLIENT_ID: 'x' }),
    /Missing environment variables: GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID/,
  );
});

// The function itself, with Google faked through the global fetch.
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

const get = () => availability(new Request('http://localhost/api/availability'));

test('is routed to /api/availability', () => {
  assert.equal(config.path, '/api/availability');
});

test('returns id, start and end for each slot, uncached', async () => {
  Object.assign(process.env, env);
  // The function reads the real clock, so the event is set relative to it.
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 25 * 60 * 1000);
  globalThis.fetch = fakeGoogle([
    { items: [timed('evt1', start.toISOString(), end.toISOString())] },
  ]).fetch;

  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    slots: [{ id: 'evt1', start: start.toISOString(), end: end.toISOString() }],
  });
});

test('fails with a plain 502 that gives nothing away', async () => {
  Object.assign(process.env, env);
  globalThis.fetch = (async () =>
    Response.json({ error: 'invalid_grant', error_description: 'Bad Request' }, { status: 400 })) as typeof fetch;
  const log = console.error;
  console.error = () => {};
  try {
    const response = await get();
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    for (const secret of Object.values(env)) assert.ok(!text.includes(secret), secret);
    assert.ok(!text.includes('invalid_grant'));
  } finally {
    console.error = log;
  }
});

test('rejects anything but GET and HEAD', async () => {
  const response = await availability(
    new Request('http://localhost/api/availability', { method: 'POST' }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
