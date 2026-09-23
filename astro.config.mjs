// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { clientLandings } from './src/data/clients';

// Bespoke prospect pages are noindex and shouldn't be advertised in the
// sitemap either. Derived from the client list so adding one can't leak.
const prospectPaths = clientLandings.map((client) => `/${client.slug}`);

// https://astro.build/config
export default defineConfig({
  site: 'https://aafke.co.uk',
  integrations: [
    sitemap({
      filter: (page) => !prospectPaths.some((path) => page.includes(path)),
    }),
  ],
});
