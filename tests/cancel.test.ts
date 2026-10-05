import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';

import cancel, { config } from '../netlify/functions/cancel.ts';
import { bookSlot } from '../netlify/lib/booking.ts';
import {
  cancelBooking,
  InvalidCancellationError,
  RESTORE_PATCH,
  validateCancellation,
} from '../netlify/lib/cancellation.ts';
import { clearAccessTokenCache, GoogleCalendarError, readConfig, toSlots } from '../netlify/lib/google-calendar.ts';

// The access token is cached in module memory, so each test starts clean.
beforeEach(clearAccessTokenCache);

const env = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REFRESH_TOKEN: 'refresh-token',
  GOOGLE_CALENDAR_ID: 'primary',
};
const google = readConfig(env);
const ORIGIN = 'https://talktome--aafke-co-uk.netlify.app';
const TOKEN = 'A'.repeat(43);

const inDays = (days: number, minutes = 0) =>
  new Date(Date.now() + days * 86_400_000 + minutes * 60_000).toISOString();

const START = inDays(2);
const END = inDays(2, 25);

const bookable = () => ({
  id: 'slot123',
  status: 'confirmed',
  summary: 'Bookable time',
  start: { dateTime: START },
  end: { dateTime: END },
});

/** Google's PATCH: null deletes, arrays and scalars replace, objects merge. */
function applyPatch(target: any, patch: any): any {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else if (typeof value === 'object' && !Array.isArray(value)) result[key] = applyPatch(result[key] ?? {}, value);
    else result[key] = value;
  }
  return result;
}

/**
 * A one-event Google Calendar that keeps state across requests, checks
 * If-Match against a changing etag, and makes a Meet when asked.
 */
function fakeCalendar(initial: object | null = bookable()) {
  let event: any = initial && { ...initial, etag: '"1"' };
  let version = 1;
  const calls: { method: string; url: URL; headers: Headers; body?: any }[] = [];
  let failPatch: Response | null = null;

  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const call = {
      method: init.method ?? 'GET',
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'access-token' });
    if (!event) return Response.json({ error: { code: 404 } }, { status: 404 });
    if (call.method === 'GET') return Response.json(event);
    if (call.method === 'PATCH') {
      if (failPatch) return failPatch;
      const ifMatch = call.headers.get('if-match');
      if (ifMatch && ifMatch !== event.etag) return new Response('Precondition Failed', { status: 412 });
      const { conferenceData, ...rest } = call.body;
      event = applyPatch(event, rest);
      if (conferenceData === null) {
        delete event.conferenceData;
        delete event.hangoutLink;
      } else if (conferenceData?.createRequest) {
        event.conferenceData = { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] };
        event.hangoutLink = 'https://meet.google.com/abc-defg-hij';
      }
      event.etag = `"${++version}"`;
      return Response.json(event);
    }
    throw new Error(`Unexpected ${call.method}`);
  }) as typeof globalThis.fetch;

  return {
    fetch,
    calls,
    get event() {
      return event;
    },
    set event(value) {
      event = value;
    },
    failNextPatch(response: Response) {
      failPatch = response;
    },
  };
}

const guest = { slotId: 'slot123', name: 'Sam Smith', email: 'sam@example.com', phone: '07700 900123', note: 'Hi' };

/** Books the fake event the real way, and returns the token it was given. */
async function bookIt(calendar: ReturnType<typeof fakeCalendar>) {
  await bookSlot(google, guest, ORIGIN, { fetch: calendar.fetch, wait: async () => {} });
  return calendar.event.extendedProperties.private.cancelToken as string;
}

const patches = (calendar: ReturnType<typeof fakeCalendar>) =>
  calendar.calls.filter((call) => call.method === 'PATCH');

// ------------------------------------------------------------- the restore

test('a valid cancellation restores the same event to an empty Bookable time slot', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  const booked = calendar.event;
  assert.equal(booked.summary, 'Sam Smith : Aafke - Chat');
  assert.ok(booked.description.includes(`/talktome/cancel?eventId=slot123&token=${token}`));

  await cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch });
  const restored = calendar.event;

  assert.equal(restored.id, 'slot123', 'the same event, not a new one');
  const calendarCalls = calendar.calls.filter((call) => call.url.hostname === 'www.googleapis.com');
  assert.ok(!calendarCalls.some((call) => call.method === 'POST' || call.method === 'DELETE'));
  assert.equal(restored.summary, 'Bookable time');
  assert.deepEqual(restored.start, { dateTime: START });
  assert.deepEqual(restored.end, { dateTime: END });
  assert.deepEqual(restored.attendees, []);
  assert.ok(!('description' in restored));
  assert.ok(!('conferenceData' in restored));
  assert.ok(!('hangoutLink' in restored));
  assert.deepEqual(restored.extendedProperties.private, {});

  const leftovers = JSON.stringify(restored);
  for (const trace of [guest.name, guest.email, guest.phone, token, 'meet.google.com']) {
    assert.ok(!leftovers.includes(trace), `still contains ${trace}`);
  }
});

test('cancelling also removes Aafke as a guest and un-hides the guest list', async () => {
  const calendar = fakeCalendar();
  await bookSlot(google, guest, ORIGIN, { fetch: calendar.fetch, wait: async () => {}, notifyEmail: 'aafke@example.com' });
  assert.equal(calendar.event.attendees.length, 2);
  assert.equal(calendar.event.guestsCanSeeOtherGuests, false);
  const token = calendar.event.extendedProperties.private.cancelToken;

  await cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch });
  assert.deepEqual(calendar.event.attendees, []);
  assert.ok(!('guestsCanSeeOtherGuests' in calendar.event));
  assert.ok(!JSON.stringify(calendar.event).includes('aafke@example.com'));
});

test('sends the restore to the same event, guarded and with notifications', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  const etag = calendar.event.etag;
  await cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch });

  const restore = patches(calendar).at(-1)!;
  assert.equal(restore.url.pathname, '/calendar/v3/calendars/primary/events/slot123');
  assert.equal(restore.url.searchParams.get('sendUpdates'), 'all');
  assert.equal(restore.url.searchParams.get('conferenceDataVersion'), '1');
  assert.equal(restore.headers.get('if-match'), etag);
  assert.deepEqual(restore.body, RESTORE_PATCH);
  assert.ok(!('start' in restore.body) && !('end' in restore.body), 'start and end are not sent');
});

test('the cancelled slot shows in availability again', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  assert.deepEqual(toSlots([calendar.event], new Date()), [], 'hidden while booked');

  await cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch });
  assert.deepEqual(toSlots([calendar.event], new Date()), [
    { id: 'slot123', start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  ]);
});

// ------------------------------------------------------------ refusals

test('an invalid token changes nothing', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  const before = calendar.event;
  const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token: wrong }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
  assert.equal(patches(calendar).length, 1, 'only the booking itself');
  assert.deepEqual(calendar.event, before);
});

test('the old token cannot be used again after cancelling', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  await cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch });

  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
  assert.equal(patches(calendar).length, 2, 'booking and one cancellation, nothing more');
});

test('booking the slot again gives a new token, and the old one does not cancel it', async () => {
  const calendar = fakeCalendar();
  const first = await bookIt(calendar);
  await cancelBooking(google, { eventId: 'slot123', token: first }, { fetch: calendar.fetch });
  const second = await bookIt(calendar);

  assert.notEqual(second, first);
  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token: first }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
  assert.equal(calendar.event.summary, 'Sam Smith : Aafke - Chat', 'the new booking stands');
});

test('a slot that is already Bookable time cannot be cancelled', async () => {
  // Even if a stray token were somehow left on it.
  const calendar = fakeCalendar({ ...bookable(), extendedProperties: { private: { cancelToken: TOKEN } } });
  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token: TOKEN }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
  assert.equal(patches(calendar).length, 0);
});

test('a past booking cannot be cancelled', async () => {
  const calendar = fakeCalendar({
    ...bookable(),
    summary: 'Sam Smith : Aafke - Chat',
    start: { dateTime: inDays(-1) },
    end: { dateTime: inDays(-1, 25) },
    extendedProperties: { private: { cancelToken: TOKEN } },
  });
  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token: TOKEN }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
  assert.equal(patches(calendar).length, 0);
});

test('a deleted event fails the same way as a wrong token', async () => {
  const calendar = fakeCalendar(null);
  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token: TOKEN }, { fetch: calendar.fetch }),
    InvalidCancellationError,
  );
});

test('a Google failure while restoring is an error, not a success', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  calendar.failNextPatch(Response.json({ error: { message: 'Backend Error' } }, { status: 500 }));
  await assert.rejects(
    cancelBooking(google, { eventId: 'slot123', token }, { fetch: calendar.fetch }),
    GoogleCalendarError,
  );
});

test('only accepts a plausible event id and token', () => {
  assert.deepEqual(validateCancellation({ eventId: 'slot123', token: TOKEN }), { eventId: 'slot123', token: TOKEN });
  assert.equal(validateCancellation({ eventId: 'slot123' }), null);
  assert.equal(validateCancellation({ eventId: '../calendarList', token: TOKEN }), null);
  assert.equal(validateCancellation({ eventId: 'slot123', token: 'short' }), null);
  assert.equal(validateCancellation(null), null);
});

// ---------------------------------------------------------- the endpoint

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
const realError = console.error;
const logged: unknown[][] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
  console.error = realError;
  logged.length = 0;
});

function useCalendar(calendar: ReturnType<typeof fakeCalendar>) {
  Object.assign(process.env, env);
  globalThis.fetch = calendar.fetch;
  console.error = (...args: unknown[]) => void logged.push(args);
}

const post = (body: unknown) =>
  cancel(
    new Request(`${ORIGIN}/api/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const INVALID = { error: 'This cancellation link is invalid or has expired.' };

test('is routed to /api/cancel', () => {
  assert.equal(config.path, '/api/cancel');
});

test('cancels with a valid link and answers 200', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  useCalendar(calendar);
  const response = await post({ eventId: 'slot123', token });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { cancelled: true });
  assert.equal(calendar.event.summary, 'Bookable time');
});

test('gives one generic answer whether the event is missing or the token is wrong', async () => {
  const missing = fakeCalendar(null);
  useCalendar(missing);
  const a = await post({ eventId: 'nosuchevent', token: TOKEN });

  const booked = fakeCalendar();
  await bookIt(booked);
  useCalendar(booked);
  const b = await post({ eventId: 'slot123', token: TOKEN });

  assert.equal(a.status, 400);
  assert.equal(b.status, 400);
  assert.deepEqual(await a.json(), INVALID);
  assert.deepEqual(await b.json(), INVALID);
  assert.equal(logged.length, 0, 'bad links are not logged');
});

test('answers 502 on a Google failure and never logs the token', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  calendar.failNextPatch(Response.json({ error: { message: 'Backend Error' } }, { status: 500 }));
  useCalendar(calendar);

  const response = await post({ eventId: 'slot123', token });
  assert.equal(response.status, 502);
  assert.ok(!('cancelled' in (await response.json())));
  const log = JSON.stringify(logged.map((args) => args.map(String)));
  assert.match(log, /Event restore failed: 500/);
  assert.ok(!log.includes(token));
});

test('answers 409 if the event changed between the check and the restore', async () => {
  const calendar = fakeCalendar();
  const token = await bookIt(calendar);
  calendar.failNextPatch(new Response('Precondition Failed', { status: 412 }));
  useCalendar(calendar);
  assert.equal((await post({ eventId: 'slot123', token })).status, 409);
});

test('a GET to the cancel API does nothing and touches no calendar', async () => {
  const calendar = fakeCalendar();
  useCalendar(calendar);
  const response = await cancel(new Request(`${ORIGIN}/api/cancel?eventId=slot123&token=${TOKEN}`));
  assert.equal(response.status, 405);
  assert.equal(calendar.calls.length, 0);
});

test('opening the cancellation page sends nothing until the button is pressed', async () => {
  const page = await readFile(new URL('../src/pages/talktome/cancel.astro', import.meta.url), 'utf8');
  const script = page.slice(page.indexOf('<script>'), page.indexOf('</script>'));
  const submit = script.indexOf("form.addEventListener('submit'");
  const request = script.indexOf("fetch('/api/cancel'");
  assert.ok(submit > 0, 'has a submit handler');
  assert.equal(script.split("fetch('/api/cancel'").length - 1, 1, 'one request, in one place');
  assert.ok(request > submit, 'the request is inside the submit handler');
  assert.match(page, /referrer="no-referrer"/);
});
