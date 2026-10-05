/**
 * Reads bookable slots from Google Calendar. Server-side only: this runs in
 * the Netlify Function and the credentials never reach the browser.
 *
 * It talks to Google's REST endpoints with fetch rather than the googleapis
 * package. Two requests are all it needs: swap the refresh token for an access
 * token, then list events.
 */
import type { AvailableSlot } from '../../src/data/talk-availability.ts';

/** Only events with exactly this title are offered as bookable. */
export const BOOKABLE_TITLE = 'Bookable time';

/** How far ahead to look. */
export const WINDOW_DAYS = 90;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars';

/** A guard against a runaway pagination loop. 250 events a page is plenty. */
const MAX_PAGES = 20;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
}

/** Carries Google's own error text, for the function logs only. */
export class GoogleCalendarError extends Error {
  name = 'GoogleCalendarError';
}

const ENV_NAMES = {
  clientId: 'GOOGLE_CLIENT_ID',
  clientSecret: 'GOOGLE_CLIENT_SECRET',
  refreshToken: 'GOOGLE_REFRESH_TOKEN',
  calendarId: 'GOOGLE_CALENDAR_ID',
} as const;

export function readConfig(env: Record<string, string | undefined>): GoogleConfig {
  const missing = Object.values(ENV_NAMES).filter((name) => !env[name]);
  if (missing.length) {
    throw new GoogleCalendarError(`Missing environment variables: ${missing.join(', ')}`);
  }
  return {
    clientId: env[ENV_NAMES.clientId]!,
    clientSecret: env[ENV_NAMES.clientSecret]!,
    refreshToken: env[ENV_NAMES.refreshToken]!,
    calendarId: env[ENV_NAMES.calendarId]!,
  };
}

interface CalendarTime {
  dateTime?: string;
  date?: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  status?: string;
  start?: CalendarTime;
  end?: CalendarTime;
}

type Fetch = typeof fetch;

async function accessToken(config: GoogleConfig, fetchImpl: Fetch): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    throw new GoogleCalendarError(`Token request failed: ${response.status} ${await response.text()}`);
  }
  const { access_token: token } = (await response.json()) as { access_token?: string };
  if (!token) throw new GoogleCalendarError('Token response had no access_token');
  return token;
}

/**
 * Turns raw events into slots: exact title, timed (not all-day), not
 * cancelled, starting after now. Times come back as UTC ISO strings.
 * Overlaps with other events are deliberately not checked.
 */
export function toSlots(events: CalendarEvent[], now: Date): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  for (const event of events) {
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (event.status === 'cancelled' || event.summary !== BOOKABLE_TITLE || !start || !end) continue;
    if (Date.parse(start) <= now.getTime()) continue;
    slots.push({
      id: event.id,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    });
  }
  return slots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export async function listBookableSlots(
  config: GoogleConfig,
  { fetch: fetchImpl = fetch, now = new Date() }: { fetch?: Fetch; now?: Date } = {},
): Promise<AvailableSlot[]> {
  const token = await accessToken(config, fetchImpl);
  const timeMax = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      // Expand recurring events into their individual occurrences.
      singleEvents: 'true',
      orderBy: 'startTime',
      // Narrows the search. toSlots still checks the title exactly.
      q: BOOKABLE_TITLE,
      maxResults: '250',
      fields: 'items(id,summary,status,start,end),nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetchImpl(
      `${CALENDAR_URL}/${encodeURIComponent(config.calendarId)}/events?${params}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new GoogleCalendarError(
        `Calendar events request failed: ${response.status} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { items?: CalendarEvent[]; nextPageToken?: string };
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return toSlots(events, now);
}
