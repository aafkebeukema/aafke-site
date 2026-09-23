import type { ServiceId } from '../services';
import type { TradeId } from '../trades';
import type { ProjectLanding } from '../project-landing-types';

/** Real work I have actually delivered, or an invented illustration. */
export type ProjectKind = 'real' | 'example';

/** Draft projects are excluded from the build entirely, not just noindexed. */
export type ProjectStatus = 'published' | 'draft';

export interface Project {
  id: string;
  name: string;
  service: ServiceId;
  trade: TradeId;
  kind: ProjectKind;
  status: ProjectStatus;
  /** Real work only: a link that lets someone verify it exists. */
  evidenceUrl?: string;
  /** Present when the project has a bespoke page of its own. */
  landing?: ProjectLanding;
}

/** The single sentence shown wherever an example is presented. */
export const EXAMPLE_DISCLAIMER =
  "This is a mocked-up example built to show what's possible, not a real customer.";
