import type { ServiceId } from '../services';
import type { TradeId } from '../trades';
import type { ProjectLanding } from '../project-landing-types';

/** Real work I have actually delivered, or an invented illustration. */
export type ProjectKind = 'real' | 'example';

/** Draft projects are excluded from the build entirely, not just noindexed. */
export type ProjectStatus = 'published' | 'draft';

/**
 * Who a project's page is for.
 *
 * 'public'  an intentional example or piece of portfolio work: linked from
 *           the menu, indexable, and listed in the sitemap.
 * 'private' a bespoke pitch sent to one named prospect: built, but noindex
 *           and kept out of the sitemap so only the recipient finds it.
 */
export type ProjectVisibility = 'public' | 'private';

export interface Project {
  id: string;
  name: string;
  service: ServiceId;
  trade: TradeId;
  kind: ProjectKind;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  /** The project's own page, when it has one. Drives the menu and sitemap. */
  path?: string;
  /** Real work only: a link that lets someone verify it exists. */
  evidenceUrl?: string;
  /** Present when the page is generated from data rather than a component. */
  landing?: ProjectLanding;
}

/** The single sentence shown wherever an example is presented. */
export const EXAMPLE_DISCLAIMER =
  "This is a mocked-up example built to show what's possible, not a real customer.";
