import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBookingResponse } from '../src/lib/booking-response.ts';

test('confirms with the Meet link when one comes back', () => {
  assert.deepEqual(
    readBookingResponse(true, { start: 's', end: 'e', meetUrl: 'https://meet.google.com/abc-defg-hij' }),
    { booked: true, meetUrl: 'https://meet.google.com/abc-defg-hij' },
  );
});

test('still confirms a successful booking without a Meet link', () => {
  assert.deepEqual(readBookingResponse(true, { start: 's', end: 'e' }), { booked: true, meetUrl: null });
  assert.deepEqual(readBookingResponse(true, {}), { booked: true, meetUrl: null });
  assert.deepEqual(readBookingResponse(true, null), { booked: true, meetUrl: null });
});

test('never links to anything but a Google Meet address', () => {
  for (const meetUrl of ['javascript:alert(1)', 'http://meet.google.com/abc', 'https://evil.example/meet', 'not a url', 42]) {
    assert.deepEqual(readBookingResponse(true, { meetUrl }), { booked: true, meetUrl: null }, String(meetUrl));
  }
});

test('does not confirm a failed request, even if it mentions a Meet', () => {
  assert.deepEqual(readBookingResponse(false, { meetUrl: 'https://meet.google.com/abc-defg-hij' }), {
    booked: false,
  });
});
