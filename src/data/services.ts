/**
 * The two things I sell. Top level of the taxonomy:
 *   service -> trade -> client
 */
export type ServiceId = 'automations' | 'websites';

export interface Service {
  id: ServiceId;
  /** Short label for navigation. */
  navLabel: string;
  /** Fuller name, used as a page heading. */
  name: string;
  price: string;
  blurb: string;
  href: string;
}

export const services: Service[] = [
  {
    id: 'automations',
    navLabel: 'AI automations',
    name: 'Custom AI automations',
    price: 'from £150 per project',
    blurb:
      'The repetitive parts of running your business, handled. Chasing payments, sorting enquiries into a to-do list, pulling scattered information into one place you can actually read.',
    href: '/automations',
  },
  {
    id: 'websites',
    navLabel: 'Websites',
    name: 'Custom websites',
    price: 'from £250 per project',
    blurb:
      'A fast, clean site that works properly on a phone and says what you do. Built to load quickly and be easy to change later, with no template subscription and no page builder lock-in.',
    href: '/websites',
  },
];

export const serviceById = (id: ServiceId): Service =>
  services.find((service) => service.id === id)!;
