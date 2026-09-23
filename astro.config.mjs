// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { nonIndexablePaths } from './src/data/projects';

// Public examples belong in the sitemap. Private prospect pitches do not, and
// drafts are never built at all, so only the private ones need excluding here.
const excluded = nonIndexablePaths();

// https://astro.build/config
export default defineConfig({
  site: 'https://aafke.co.uk',
  integrations: [
    sitemap({
      filter: (page) => !excluded.some((path) => page.includes(path)),
    }),
  ],
});
