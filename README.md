# aafke.co.uk

Site built with [Astro](https://astro.build), hosted on Netlify. Pages are
static; the /talktome booking API runs as Netlify Functions.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321 (pages only, no /api routes)
npm run build    # outputs to dist/
npm run preview  # serve the built site locally
npm test         # unit tests in tests/
netlify dev      # pages plus the /api functions (needs the Netlify CLI)
```

`netlify dev` only reaches Google if the `GOOGLE_*` variables have values in
Netlify's "Local development" context; they're empty by default.

## Deployment

Netlify builds `main` and publishes it to aafke.co.uk; `netlify.toml` sets the
build (`npm run build`, publish `dist/`) and the functions directory. Pushing to
`main` is all it takes. Other branches with a Netlify branch deploy (e.g.
`talktome`) get their own preview URL.

A commit message containing `[skip ci]` skips the Netlify build too. Use
`[skip actions]` to skip only GitHub Actions.

### Functions

`netlify/functions/` holds one file per route, each declaring its own path:

- `GET /api/availability`: bookable slots from Google Calendar
- `POST /api/book`: books a slot and creates the Meet link
- `POST /api/cancel`: cancels a booking from the link in its confirmation

They read these Netlify environment variables (Site configuration ->
Environment variables), and pick up changes only after a redeploy:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the OAuth client in Google Cloud
  project `aafke-booking`
- `GOOGLE_REFRESH_TOKEN`: lets the functions act on the calendar
- `GOOGLE_CALENDAR_ID`: the calendar holding the "Bookable time" events
- `BOOKING_NOTIFY_EMAIL` (optional): added as a hidden guest on every booking

### Leftover GitHub Pages workflow

`.github/workflows/deploy.yml` still builds `main` and publishes it to GitHub
Pages on every push, and `public/CNAME` still names `aafke.co.uk`. Neither is
what visitors see: the domain's DNS points at Netlify.

## Custom domain

DNS is managed at IONOS:

| Type  | Host | Value                      |
|-------|------|----------------------------|
| A     | @    | 75.2.60.5                  |
| CNAME | www  | aafke-co-uk.netlify.app.   |

`www.aafke.co.uk` redirects to `aafke.co.uk`. Netlify provides the HTTPS
certificate.

Verify from a terminal:

```bash
dig +short aafke.co.uk                       # 75.2.60.5
curl -sSI https://aafke.co.uk | grep -i server  # server: Netlify
```

## Monitoring /talktome

An UptimeRobot **Keyword** monitor checks `https://aafke.co.uk/api/availability`
every 60 minutes and emails when the keyword `"start"` (with the quotes) is
missing.

`"start"` only appears inside a slot (`{"slots":[{"id":…,"start":…,"end":…}],"until":…}`),
so it's there only when at least one time can be booked. Any failure talking to
Google returns a 502 with `{"error":…}`, and a calendar with no bookable times
returns `{"slots":[]}`. Neither contains `"start"`, so both raise an alert.

An alert probably means one of these:

- **The Google refresh token is dead** (most likely). The Netlify function log
  for `availability` shows `Token request failed: 400 … invalid_grant`. Mint a
  new token in the [OAuth Playground](https://developers.google.com/oauthplayground)
  (own credentials, scope `https://www.googleapis.com/auth/calendar.events`,
  signed in as the calendar owner), put it in Netlify's `GOOGLE_REFRESH_TOKEN`,
  and redeploy. Tokens die if the Google Cloud app (project `aafke-booking`) is
  back in "Testing" (7-day expiry), the account password changes, or access is
  removed.
- **A Netlify environment variable is missing or wrong.** The log says
  `Missing environment variables: …`, or Google rejects the client. Check
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and
  `GOOGLE_CALENDAR_ID`, and redeploy after any change.
- **There are no bookable times.** The endpoint returns 200 with no slots. Add
  more "Bookable time" events (the title must match exactly) within this month
  and the next four.

The monitor only covers reading availability. A broken `/api/book` (e.g. a token
without write access) won't trigger it.

## Structure

- `src/pages/` — one file per route
- `src/layouts/Layout.astro` — shared `<head>`, global styles, colour tokens
- `public/` — files copied verbatim to the site root (favicon, CNAME)
