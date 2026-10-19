# aafke.co.uk

Static site built with [Astro](https://astro.build), hosted on GitHub Pages.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the built site locally
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site
and publishes it to GitHub Pages. No manual step needed.

## Custom domain

`public/CNAME` contains `aafke.co.uk` and is copied into the build output, which
is how GitHub Pages keeps the custom domain attached on every deploy. Don't
delete it.

### DNS records to create at IONOS

DNS must resolve to GitHub *before* GitHub will issue the HTTPS certificate and
accept the domain, so do this step first.

Four `A` records on the apex, all with host `@`:

| Type | Host | Value           |
|------|------|-----------------|
| A    | @    | 185.199.108.153 |
| A    | @    | 185.199.109.153 |
| A    | @    | 185.199.110.153 |
| A    | @    | 185.199.111.153 |

Optionally the same four as `AAAA` for IPv6:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
`2606:50c0:8003::153`

And one `CNAME` so the `www` form works too:

| Type  | Host | Value                    |
|-------|------|--------------------------|
| CNAME | www  | aafkebeukema.github.io.  |

Remove any IONOS parking/forwarding record on `@` first — it will conflict.

### Then, in GitHub

Settings -> Pages -> Custom domain -> enter `aafke.co.uk` -> Save. Once the
certificate is issued (usually minutes, occasionally up to an hour), tick
**Enforce HTTPS**.

Verify from a terminal:

```bash
dig +short aafke.co.uk
curl -sSI https://aafke.co.uk | head -1
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
