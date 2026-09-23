import type { ServiceId } from '../services';
import type { Project } from './types';
import { pencilDesign } from './pencil-design';
import { sunnyDays } from './sunny-days';
import { kerbsideCycles } from './kerbside-cycles';

export type { Project, ProjectKind, ProjectStatus } from './types';
export { EXAMPLE_DISCLAIMER } from './types';

/**
 * Every project, real or invented, published or draft.
 *
 * To add one: copy the nearest file in this folder and add it here. Set
 * kind honestly, because the labelling on the site is derived from it
 * rather than written by hand.
 */
export const projects: Project[] = [pencilDesign, sunnyDays, kerbsideCycles];

export const published = (list: Project[] = projects): Project[] =>
  list.filter((project) => project.status === 'published');

export const projectsForService = (service: ServiceId): Project[] =>
  published().filter((project) => project.service === service);

export const projectById = (id: string): Project | undefined =>
  projects.find((project) => project.id === id);

/** Projects with a bespoke page that is ready to build. */
export const buildableLandings = (): Project[] =>
  published().filter((project) => project.landing !== undefined);

/**
 * True when everything shown for a service is invented, so a heading must
 * not claim real customers.
 */
export const serviceHasRealWork = (service: ServiceId): boolean =>
  projectsForService(service).some((project) => project.kind === 'real');
