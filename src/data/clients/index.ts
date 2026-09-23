import type { ClientLanding } from '../client-landing-types';
import { kerbsideCycles } from './kerbside-cycles';

/**
 * Bespoke pages sent to one named prospect. Flat URLs and noindex on purpose:
 * the hierarchy lives in the service/trade fields, not in the address.
 *
 * To add one: copy the nearest file in this folder, change the content, and
 * add it to the array below.
 */
export const clientLandings: ClientLanding[] = [kerbsideCycles];

export const clientsForTrade = (trade: ClientLanding['trade']): ClientLanding[] =>
  clientLandings.filter((client) => client.trade === trade);
