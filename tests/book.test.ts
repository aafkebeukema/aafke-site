import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';

import book, { config } from '../netlify/functions/book.ts';
import { bookedTitle, bookSlot, SlotUnavailableError, validateBooking } from '../netlify/lib/booking.ts';
import { clearAccessTokenCache, GoogleCalendarError, readConfig } from '../netlify/lib/google-calendar.ts';

// The access token is cached in module memory, so each test starts clean.
beforeEach(clearAccessTokenCache);

const env = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REFRESH_TOKEN: 'refresh-token',
  GOOGLE_CALENDAR_ID: 'primary',
};
const google = readConfig(env);

const inDays = (days: number, minutes = 0) =>
  new Date(Date.now() + days * 86_400_000 + minutes * 60_000).toISOString();

const MEET = 'https://meet.google.com/abc-defg-hij';
const ORIGIN = 'https://talktome--aafke-co-uk.netlify.app';

// Fixed once, so every copy of the event has exactly the same times.
const SLOT_START = inDays(2);
const SLOT_END = inDays(2, 25);

const bookableEvent = (overrides: object = {}) => ({
  id: 'slot123',
  etag: '"3181159875584000"',
  status: 'confirmed',
  summary: 'Bookable time',
  start: { dateTime: SLOT_START },
  end: { dateTime: SLOT_END },
  ...overrides,
});

const form = {
  slotId: 'slot123',
  name: 'Sam Smith',
  email: 'sam@example.com',
  phone: '07700 900123',
  note: 'Testing in small teams',
  company_fax: '',
};

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body?: any;
}

/** A stand-in for Google. `event` is what a GET returns; `patch` decides the PATCH reply. */
function fakeGoogle({
  event = bookableEvent() as object | null,
  patch = (body: any): Response =>
    Response.json({ ...bookableEvent(), ...body, hangoutLink: MEET }),
} = {}) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init.method ?? 'GET',
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'access-token' });
    if (call.method === 'GET') {
      return event ? Response.json(event) : Response.json({ error: { code: 404 } }, { status: 404 });
    }
    if (call.method === 'PATCH') return patch(call.body);
    throw new Error(`Unexpected ${call.method} ${url}`);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const checked = () => {
  const result = validateBooking(form);
  assert.ok(result.ok);
  return result.booking;
};

// --------------------------------------------------------------- validation

test('accepts a complete form and trims it', () => {
  const result = validateBooking({ ...form, name: '  Sam Smith ', phone: '', note: '' });
  assert.deepEqual(result, {
    ok: true,
    booking: { slotId: 'slot123', name: 'Sam Smith', email: 'sam@example.com' },
  });
});

test('rejects missing or invalid fields with per-field messages', () => {
  assert.deepEqual(validateBooking({ company_fax: '' }), {
    ok: false,
    reason: 'invalid',
    fields: {
      slotId: 'Please choose a time.',
      name: 'Please add your name.',
      email: 'Please add your email address.',
    },
  });

  for (const email of ['sam', 'sam@', 'sam@example', 'sam @example.com', `${'a'.repeat(250)}@x.com`]) {
    const result = validateBooking({ ...form, email });
    assert.ok(!result.ok && result.reason === 'invalid' && result.fields.email, email);
  }

  const lineBreakName = validateBooking({ ...form, name: 'Sam\nSmith' });
  assert.ok(!lineBreakName.ok && lineBreakName.reason === 'invalid' && lineBreakName.fields.name);

  const badSlot = validateBooking({ ...form, slotId: '../../calendarList' });
  assert.ok(!badSlot.ok && badSlot.reason === 'invalid' && badSlot.fields.slotId);

  const longNote = validateBooking({ ...form, note: 'x'.repeat(2001) });
  assert.ok(!longNote.ok && longNote.reason === 'invalid' && longNote.fields.note);
});

test('treats a filled company_fax honeypot as a bot', () => {
  assert.deepEqual(validateBooking({ ...form, company_fax: '020 7946 0000' }), {
    ok: false,
    reason: 'honeypot',
  });
});

test('no longer treats website as the honeypot, so an autofilled one is harmless', () => {
  assert.equal(validateBooking({ ...form, website: 'https://autofilled.example' }).ok, true);
});

test('the page sends company_fax and has no website field', async () => {
  const page = await readFile(new URL('../src/pages/talktome.astro', import.meta.url), 'utf8');
  assert.match(page, /name="company_fax"/);
  assert.match(page, /company_fax: value\('company_fax'\)/);
  assert.doesNotMatch(page, /name="website"|value\('website'\)/);
});

// ------------------------------------------------------------------ booking

test('turns the same event into the meeting, with attendee, Meet and invitation', async () => {
  const fake = fakeGoogle();
  const result = await bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch, cancelToken: 'cancel-token' });

  assert.deepEqual(result, { start: bookableEvent().start.dateTime, end: bookableEvent().end.dateTime, meetUrl: MEET });

  const [token, read, update, ...rest] = fake.calls;
  assert.equal(token.url.hostname, 'oauth2.googleapis.com');
  assert.equal(rest.length, 0, 'no second event is created and nothing else is called');

  // Re-read the same event first.
  assert.equal(read.method, 'GET');
  assert.equal(read.url.pathname, '/calendar/v3/calendars/primary/events/slot123');

  // Then update that same event, conditionally on it not having changed.
  assert.equal(update.method, 'PATCH');
  assert.equal(update.url.pathname, '/calendar/v3/calendars/primary/events/slot123');
  assert.equal(update.url.searchParams.get('sendUpdates'), 'all');
  assert.equal(update.url.searchParams.get('conferenceDataVersion'), '1');
  assert.equal(update.headers.get('if-match'), '"3181159875584000"');
  assert.equal(update.headers.get('authorization'), 'Bearer access-token');

  const body = update.body;
  assert.equal(body.summary, 'Sam Smith : Aafke - Chat');
  assert.deepEqual(body.attendees, [{ email: 'sam@example.com', displayName: 'Sam Smith' }]);
  assert.deepEqual(body.conferenceData.createRequest.conferenceSolutionKey, { type: 'hangoutsMeet' });
  assert.match(body.conferenceData.createRequest.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(body.extendedProperties, { private: { cancelToken: 'cancel-token' } });
  assert.ok(!('start' in body) && !('end' in body), 'start and end are left untouched');
  for (const part of ['Name: Sam Smith', 'Email: sam@example.com', 'Phone: 07700 900123', 'Testing in small teams']) {
    assert.ok(body.description.includes(part), part);
  }
  assert.ok(
    body.description.includes(`Need to cancel? ${ORIGIN}/talktome/cancel?eventId=slot123&token=cancel-token`),
    body.description,
  );
});

test('leaves phone and note out of the description when not given', async () => {
  const fake = fakeGoogle();
  await bookSlot(google, { slotId: 'slot123', name: 'Sam', email: 'sam@example.com' }, ORIGIN, { fetch: fake.fetch });
  const description: string = fake.calls[2].body.description;
  assert.ok(!description.includes('Phone:'));
  assert.ok(!description.includes('chat about'));
});

test('keeps existing attendees and private properties', async () => {
  const fake = fakeGoogle({
    event: bookableEvent({
      attendees: [{ email: 'aafke@example.com', organizer: true }],
      extendedProperties: { private: { source: 'kept' } },
    }),
  });
  await bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch, cancelToken: 't' });
  const body = fake.calls[2].body;
  assert.deepEqual(body.attendees.map((a: { email: string }) => a.email), ['aafke@example.com', 'sam@example.com']);
  assert.deepEqual(body.extendedProperties.private, { source: 'kept', cancelToken: 't' });
});

test('adds Aafke as a hidden extra guest when a notify address is set', async () => {
  const fake = fakeGoogle();
  await bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch, notifyEmail: 'aafke@example.com' });
  const body = fake.calls.find((call) => call.method === 'PATCH')!.body;
  assert.deepEqual(body.attendees, [
    { email: 'sam@example.com', displayName: 'Sam Smith' },
    { email: 'aafke@example.com' },
  ]);
  assert.equal(body.guestsCanSeeOtherGuests, false, 'the booker cannot see her address');
});

test('changes nothing about guests when no notify address is set', async () => {
  const fake = fakeGoogle();
  await bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch });
  const body = fake.calls.find((call) => call.method === 'PATCH')!.body;
  assert.deepEqual(body.attendees, [{ email: 'sam@example.com', displayName: 'Sam Smith' }]);
  assert.ok(!('guestsCanSeeOtherGuests' in body));
});

test('does not invite the same address twice when Aafke books herself', async () => {
  const fake = fakeGoogle();
  await bookSlot(
    google,
    { slotId: 'slot123', name: 'Aafke', email: 'Aafke@Example.com' },
    ORIGIN,
    { fetch: fake.fetch, notifyEmail: 'aafke@example.com' },
  );
  const body = fake.calls.find((call) => call.method === 'PATCH')!.body;
  assert.deepEqual(body.attendees, [{ email: 'Aafke@Example.com', displayName: 'Aafke' }]);
});

test('generates a different high-entropy cancel token for each booking', async () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 2; i++) {
    const fake = fakeGoogle();
    await bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch });
    tokens.add(fake.calls[2].body.extendedProperties.private.cancelToken);
  }
  assert.equal(tokens.size, 2);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
});

test('waits for a Meet that Google is still creating', async () => {
  let reads = 0;
  const fake = fakeGoogle({
    patch: (body) =>
      Response.json({ ...bookableEvent(), ...body, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }),
  });
  const pendingThenReady = (async (input: string | URL | Request, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET' && String(input).includes('/events/') && ++reads > 1) {
      return Response.json({ ...bookableEvent(), hangoutLink: MEET });
    }
    return fake.fetch(input, init);
  }) as typeof fetch;

  const result = await bookSlot(google, checked(), ORIGIN, { fetch: pendingThenReady, wait: async () => {} });
  assert.equal(result.meetUrl, MEET);
});

test('still succeeds, without meetUrl, when the Meet is not ready after the retries', async () => {
  const fake = fakeGoogle({ patch: (body) => Response.json({ ...bookableEvent(), ...body }) });
  const waits: number[] = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await bookSlot(google, checked(), ORIGIN, {
      fetch: fake.fetch,
      wait: async (ms) => void waits.push(ms),
    });
    assert.deepEqual(result, { start: bookableEvent().start.dateTime, end: bookableEvent().end.dateTime });
    assert.equal(waits.length, 3, 'tried briefly before giving up on the link');
    assert.equal(fake.calls.filter((call) => call.method === 'PATCH').length, 1, 'no second update, no rollback');
    assert.ok(!fake.calls.some((call) => call.method === 'DELETE'));
  } finally {
    console.warn = warn;
  }
});

test('still succeeds when re-reading the event for the Meet fails', async () => {
  let reads = 0;
  const fake = fakeGoogle({ patch: (body) => Response.json({ ...bookableEvent(), ...body }) });
  const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET' && String(input).includes('/events/') && ++reads > 1) {
      throw new TypeError('fetch failed');
    }
    return fake.fetch(input, init);
  }) as typeof fetch;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await bookSlot(google, checked(), ORIGIN, { fetch: flaky, wait: async () => {} });
    assert.ok(!('meetUrl' in result));
  } finally {
    console.warn = warn;
  }
});

for (const [label, event] of [
  ['already booked (retitled)', bookableEvent({ summary: 'Alex : Aafke - Chat' })],
  ['in the past', bookableEvent({ start: { dateTime: inDays(-1) }, end: { dateTime: inDays(-1, 25) } })],
  ['all-day', bookableEvent({ start: { date: '2026-12-01' }, end: { date: '2026-12-02' } })],
  ['cancelled', bookableEvent({ status: 'cancelled' })],
  ['deleted', null],
] as const) {
  test(`refuses a slot that is ${label}, without changing it`, async () => {
    const fake = fakeGoogle({ event });
    await assert.rejects(bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch }), SlotUnavailableError);
    assert.ok(!fake.calls.some((call) => call.method === 'PATCH'));
  });
}

test('treats a changed event (412 from If-Match) as taken', async () => {
  const fake = fakeGoogle({ patch: () => new Response('Precondition Failed', { status: 412 }) });
  await assert.rejects(bookSlot(google, checked(), ORIGIN, { fetch: fake.fetch }), SlotUnavailableError);
});

// ---------------------------------------------------------- the endpoint

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
const realError = console.error;
const realWarn = console.warn;
const logged: unknown[][] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
  console.error = realError;
  console.warn = realWarn;
  logged.length = 0;
});

function useGoogle(options?: Parameters<typeof fakeGoogle>[0]) {
  Object.assign(process.env, env);
  const fake = fakeGoogle(options);
  globalThis.fetch = fake.fetch;
  console.error = (...args: unknown[]) => void logged.push(args);
  return fake;
}

const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  book(new Request('http://localhost/api/book', { method: 'POST', headers, body: JSON.stringify(body) }));

test('is routed to /api/book', () => {
  assert.equal(config.path, '/api/book');
});

test('builds the cancellation link from the request origin, not a fixed URL', async () => {
  const fake = useGoogle();
  await book(
    new Request('https://talktome--aafke-co-uk.netlify.app/api/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    }),
  );
  const { description, extendedProperties } = fake.calls.find((call) => call.method === 'PATCH')!.body;
  const token = extendedProperties.private.cancelToken;
  assert.ok(
    description.includes(`https://talktome--aafke-co-uk.netlify.app/talktome/cancel?eventId=slot123&token=${token}`),
  );
});

test('takes the notify address from BOOKING_NOTIFY_EMAIL, ignoring anything invalid', async () => {
  for (const [value, expected] of [
    ['aafke@example.com', 'aafke@example.com'],
    ['  aafke@example.com  ', 'aafke@example.com'],
    ['not-an-email', undefined],
    ['', undefined],
  ] as const) {
    const fake = useGoogle();
    process.env.BOOKING_NOTIFY_EMAIL = value;
    await post(form);
    const emails = fake.calls.find((call) => call.method === 'PATCH')!.body.attendees.map((a: { email: string }) => a.email);
    assert.deepEqual(emails, expected ? ['sam@example.com', expected] : ['sam@example.com'], JSON.stringify(value));
    clearAccessTokenCache();
  }
});

test('books and returns only start, end and the Meet link', async () => {
  useGoogle();
  const response = await post(form);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(await response.json()), ['start', 'end', 'meetUrl']);
});

test('answers 200 without meetUrl when the event was booked but the Meet is slow', async () => {
  useGoogle({ patch: (body) => Response.json({ ...bookableEvent(), ...body }) });
  console.warn = () => {};
  const response = await post(form);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()), ['start', 'end']);
});

test('answers 409 when the slot has been retitled', async () => {
  const fake = useGoogle({ event: bookableEvent({ summary: 'Alex : Aafke - Chat' }) });
  const response = await post(form);
  assert.equal(response.status, 409);
  assert.ok((await response.json()).error);
  assert.ok(!fake.calls.some((call) => call.method === 'PATCH'));
});

test('answers 409 when the slot is in the past', async () => {
  useGoogle({ event: bookableEvent({ start: { dateTime: inDays(-1) }, end: { dateTime: inDays(-1, 25) } }) });
  assert.equal((await post(form)).status, 409);
});

test('answers 400 with field messages for missing data, without calling Google', async () => {
  const fake = useGoogle();
  const response = await post({ ...form, name: '', email: 'nope' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.fields.name, 'Please add your name.');
  assert.equal(body.fields.email, "That doesn't look like an email address.");
  assert.equal(fake.calls.length, 0);
});

test('answers 400 to a filled company_fax honeypot, without calling Google', async () => {
  const fake = useGoogle();
  const response = await post({ ...form, company_fax: 'spam' });
  assert.equal(response.status, 400);
  assert.ok(!('fields' in (await response.json())));
  assert.equal(fake.calls.length, 0);
});

test('never reports success when Google fails, and logs no personal data', async () => {
  useGoogle({ patch: () => Response.json({ error: { message: 'Backend Error' } }, { status: 500 }) });
  const response = await post(form);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.ok(!('meetUrl' in body));

  const log = JSON.stringify(logged.map((args) => args.map(String)));
  assert.match(log, /Event update failed: 500/);
  for (const value of [form.name, form.email, form.phone, form.note, ...Object.values(env)]) {
    assert.ok(!log.includes(value), `logged ${value}`);
  }
});

test('answers 502 when the token is refused', async () => {
  Object.assign(process.env, env);
  globalThis.fetch = (async () => Response.json({ error: 'invalid_grant' }, { status: 400 })) as typeof fetch;
  console.error = () => {};
  assert.equal((await post(form)).status, 502);
});

test('only accepts JSON POSTs', async () => {
  assert.equal((await book(new Request('http://localhost/api/book'))).status, 405);
  assert.equal((await post(form, { 'content-type': 'text/plain' })).status, 415);
});

test('builds the booked title from the name', () => {
  assert.equal(bookedTitle('Sam Smith'), 'Sam Smith : Aafke - Chat');
});
