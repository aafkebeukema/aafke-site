import type { ServiceId } from './services';
import type { TradeId } from './trades';

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

export interface ClientLanding {
  slug: string;
  /** Which of the two things I sell this page is pitching. */
  service: ServiceId;
  /** The kind of business the client runs. */
  trade: TradeId;
  clientName: string;
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
