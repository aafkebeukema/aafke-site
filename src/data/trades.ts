import type { ServiceId } from './services';

/**
 * A trade is a recognisable kind of business with a recognisable set of
 * repetitive jobs. It is the layer the reusable demo components are built
 * around: a childminder means chat plus a spreadsheet, a mobile mechanic
 * means chat plus a calendar plus a message sent from the van.
 */
export type TradeId = 'childminding' | 'mobile-bike-repair' | 'joinery';

export interface Trade {
  id: TradeId;
  service: ServiceId;
  name: string;
  blurb: string;
}

export const trades: Trade[] = [
  {
    id: 'childminding',
    service: 'automations',
    name: 'Childminding',
    blurb:
      'Bookings arriving by group chat, a register kept in a spreadsheet, and invoices added up by hand at the end of the month.',
  },
  {
    id: 'mobile-bike-repair',
    service: 'automations',
    name: 'Mobile bike repair',
    blurb:
      'Jobs booked over WhatsApp between callouts, a day that moves around constantly, and customers waiting on an honest ETA.',
  },
  {
    id: 'joinery',
    service: 'websites',
    name: 'Joinery and construction',
    blurb:
      'A phone full of photographs of finished work, and no site that does them justice.',
  },
];

export const tradesForService = (service: ServiceId): Trade[] =>
  trades.filter((trade) => trade.service === service);
