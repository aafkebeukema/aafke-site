export interface ChatMessage {
  text: string;
  time: string;
  direction?: 'incoming' | 'outgoing';
}

export interface ChatDemo {
  type: 'chat';
  contact: string;
  meta: string;
  fromOwner?: boolean;
  messages: ChatMessage[];
}

export interface CalendarEvent {
  startRow: number;
  endRow: number;
  time: string;
  title: string;
  detail?: string;
  isNew?: boolean;
}

export interface CalendarDemo {
  type: 'calendar';
  day: string;
  date: string;
  hours: string[];
  events: CalendarEvent[];
}

export interface DraftDemo {
  type: 'draft';
  label: string;
  message: string;
  buttonLabel?: string;
}

export type TimelineDemo = ChatDemo | CalendarDemo | DraftDemo;

export interface TimelineStep {
  time: string;
  note: string;
  demo: TimelineDemo;
}

/**
 * The bespoke one-off page some projects have. Only page content lives here:
 * what the project *is* (service, trade, kind, status) belongs on Project.
 */
export interface ProjectLanding {
  slug: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  headline: string;
  introduction: string;
  steps: TimelineStep[];
  callToAction: {
    heading: string;
    body: string;
    email: string;
  };
}
