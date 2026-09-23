// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { buildableLandings } from './src/data/projects';

// Bespoke project pages are noindex, so they stay out of the sitemap too.
// Draft projects are not built at all and so cannot appear here.
const landingPaths = buildableLandings().map((project) => `/${project.landing.slug}`);

// https://astro.build/config
export default defineConfig({
  site: 'https://aafke.co.uk',
  integrations: [
    sitemap({
      filter: (page) => !landingPaths.some((path) => page.includes(path)),
    }),
  ],
});
