/**
 * Mocked availability for /talktome, until the real calendar is connected.
 *
 * Each slot is an exact moment, not a wall-clock time, because that is what a
 * calendar API will hand back. The page groups and labels them in the
 * visitor's own timezone. These match the Figma design when viewed from
 * London: BST (+01:00) until the clocks change on 25 October, GMT after.
 */
export const MEETING_MINUTES = 25;

export const mockSlots: string[] = [
  '2026-10-07T09:30:00+01:00',
  '2026-10-07T14:00:00+01:00',
  '2026-10-09T11:00:00+01:00',
  '2026-10-09T15:30:00+01:00',
  '2026-10-13T10:00:00+01:00',
  '2026-10-13T11:30:00+01:00',
  '2026-10-13T15:00:00+01:00',
  '2026-10-16T09:00:00+01:00',
  '2026-10-16T13:30:00+01:00',
  '2026-10-20T10:30:00+01:00',
  '2026-10-20T14:30:00+01:00',
  '2026-10-20T16:00:00+01:00',
  '2026-10-22T11:00:00+01:00',
  '2026-10-27T09:30:00Z',
  '2026-10-27T12:00:00Z',
  '2026-10-27T15:30:00Z',
  '2026-10-29T10:00:00Z',
  '2026-10-29T14:00:00Z',
  '2026-11-03T10:00:00Z',
  '2026-11-03T13:00:00Z',
  '2026-11-06T09:30:00Z',
  '2026-11-06T14:30:00Z',
  '2026-11-10T11:00:00Z',
  '2026-11-10T15:00:00Z',
  '2026-11-12T10:30:00Z',
  '2026-11-17T09:00:00Z',
  '2026-11-17T13:30:00Z',
  '2026-11-20T11:30:00Z',
  '2026-11-20T15:30:00Z',
];

/** One bookable slot, as GET /api/availability returns it. ISO 8601, in UTC. */
export interface AvailableSlot {
  start: string;
  end: string;
}

/** The body of GET /api/availability. */
export interface Availability {
  durationMinutes: number;
  slots: AvailableSlot[];
}

/** The mocked slots in the API's shape. Google Calendar replaces this later. */
export function mockAvailability(): Availability {
  return {
    durationMinutes: MEETING_MINUTES,
    slots: mockSlots.map((iso) => {
      const start = new Date(iso);
      const end = new Date(start.getTime() + MEETING_MINUTES * 60_000);
      return { start: start.toISOString(), end: end.toISOString() };
    }),
  };
}
