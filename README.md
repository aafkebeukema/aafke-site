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


## Structure

- `src/pages/` — one file per route
- `src/layouts/Layout.astro` — shared `<head>`, global styles, colour tokens
- `public/` — files copied verbatim to the site root (favicon, CNAME)
