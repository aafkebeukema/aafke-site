import type { ServiceId } from '../services';
import { tradesForService } from '../trades';
import type { Project } from './types';
import { pencilDesign } from './pencil-design';
import { sunnyDays } from './sunny-days';
import { kerbsideCycles } from './kerbside-cycles';

export type {
  Project,
  ProjectKind,
  ProjectStatus,
  ProjectVisibility,
} from './types';
export { EXAMPLE_DISCLAIMER } from './types';

/**
 * Every project, real or invented, published or draft.
 *
 * To add one: copy the nearest file in this folder and add it here. Set kind
 * and visibility honestly, because the labelling and the indexing rules are
 * derived from them rather than written by hand.
 */
export const projects: Project[] = [pencilDesign, sunnyDays, kerbsideCycles];

export const published = (list: Project[] = projects): Project[] =>
  list.filter((project) => project.status === 'published');

export const projectsForService = (service: ServiceId): Project[] =>
  published().filter((project) => project.service === service);

export const projectById = (id: string): Project | undefined =>
  projects.find((project) => project.id === id);

export const projectForTrade = (trade: Project['trade']): Project | undefined =>
  published().find((project) => project.trade === trade);

/** Projects whose page is generated from landing data and is ready to build. */
export const buildableLandings = (): Project[] =>
  published().filter((project) => project.landing !== undefined);

/**
 * A published project page is indexable only when it is meant for everyone.
 * Private prospect pitches stay noindex, and drafts are never built at all.
 */
export const isIndexable = (project: Project): boolean =>
  project.status === 'published' && project.visibility === 'public';

/** Paths that must be kept out of the sitemap. */
export const nonIndexablePaths = (): string[] =>
  published()
    .filter((project) => !isIndexable(project))
    .map((project) => project.path ?? (project.landing ? `/${project.landing.slug}` : ''))
    .filter((path): path is string => path.length > 0);

export interface MenuEntry {
  href: string;
  label: string;
}

/**
 * The submenu under a service: its overview, then one entry per trade that
 * has a public page behind it.
 */
export const menuForService = (service: ServiceId, overviewHref: string): MenuEntry[] => [
  { href: overviewHref, label: 'Overview' },
  ...tradesForService(service).flatMap((trade) => {
    const project = projectForTrade(trade.id);
    if (!project?.path || !isIndexable(project)) return [];
    return [{ href: project.path, label: `${trade.name}: ${project.name}` }];
  }),
];
