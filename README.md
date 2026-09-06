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

DNS lives at IONOS. The apex record points at GitHub's Pages IP addresses; `www`
is a CNAME to `aafkebeukema.github.io`.

## Structure

- `src/pages/` — one file per route
- `src/layouts/Layout.astro` — shared `<head>`, global styles, colour tokens
- `public/` — files copied verbatim to the site root (favicon, CNAME)
