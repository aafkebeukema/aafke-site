import assert from 'node:assert/strict';
import { test } from 'node:test';

import availability, { config } from '../netlify/functions/availability.ts';
import { MEETING_MINUTES, mockSlots } from '../src/data/talk-availability.ts';

const get = () => availability(new Request('http://localhost/api/availability'));

test('is routed to /api/availability', () => {
  assert.equal(config.path, '/api/availability');
});

test('returns every mocked slot as JSON, uncached', async () => {
  const response = await get();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json();
  assert.equal(body.durationMinutes, MEETING_MINUTES);
  assert.deepEqual(
    body.slots.map((slot: { start: string }) => Date.parse(slot.start)),
    mockSlots.map((iso) => Date.parse(iso)),
  );
  for (const { start, end } of body.slots) {
    assert.match(start, /Z$/);
    assert.match(end, /Z$/);
  }
});

test('each slot ends one meeting length after it starts', async () => {
  const { slots } = await (await get()).json();
  for (const { start, end } of slots) {
    assert.equal(Date.parse(end) - Date.parse(start), MEETING_MINUTES * 60_000, start);
  }
});

test('rejects anything but GET and HEAD', async () => {
  const response = await availability(
    new Request('http://localhost/api/availability', { method: 'POST' }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
