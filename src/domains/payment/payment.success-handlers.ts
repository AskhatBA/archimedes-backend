import { registerAppointmentPaymentHandler } from '@/domains/appointments/appointment.payment-handler';
import { registerProgramOrderPaymentHandler } from '@/domains/program-orders/program-order.payment-handler';
import { registerMedAccountPaymentHandler } from '@/domains/med-account/med-account.payment-handler';

/**
 * Wires every purpose handler into the payment lifecycle.
 *
 * Called once at startup, before any request is served and before the reconciliation
 * worker runs, so a payment can never settle with its handler still unregistered. This
 * is the file to touch when a new `PaymentPurpose` needs logic attached — the payment
 * domain itself stays unaware of what the handlers do.
 */
export const registerPaymentSuccessHandlers = (): void => {
  registerAppointmentPaymentHandler();
  registerProgramOrderPaymentHandler();
  registerMedAccountPaymentHandler();
};
