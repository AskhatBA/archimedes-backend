import { config } from '@/config';
import { POSITION_NAMES } from '@/domains/fiscal/fiscal.positions';

import { TelemedicineOfferDto } from './appointments.dto';

/**
 * What a telemedicine visit is called — the booking form's price card and the payment
 * description. The very string the fiscal receipt already names such a visit by, so the
 * form and the receipt cannot drift apart.
 */
export const TELEMEDICINE_SERVICE_NAME: string = POSITION_NAMES.telemedicine;

/**
 * The online consultation as the app offers it: one service, one price, whichever doctor
 * holds it. The price is ours (`config.telemedicine.price`) and is what `/payment/init`
 * checks a paid telemedicine visit against. The MIS service code is not part of it — the
 * app has no use for it.
 */
export const getTelemedicineOffer = (): TelemedicineOfferDto => ({
  price: config.telemedicine.price,
  serviceName: TELEMEDICINE_SERVICE_NAME,
});
