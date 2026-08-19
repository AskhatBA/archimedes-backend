import { createLogger } from '@/shared/lib/logger';

const postSuccessLogger = createLogger('payment-post-success');

export interface PaymentSuccessContext {
  /** Our own payment record id (sent to FreedomPay as pg_order_id). */
  paymentId: string;
  userId: string;
  /** Amount credited to the user's balance, in KZT. */
  amount: number;
  /** FreedomPay transaction id, absent only if the provider never reported one. */
  pgPaymentId?: string | undefined;
}

/**
 * Business logic to run once a payment is confirmed successful.
 *
 * Called from `settlePayment` at the single point that knows a payment just moved out of
 * PENDING, so it runs **exactly once per payment** — never again on the callback retries
 * FreedomPay sends for two hours, and not a second time when the reconciliation poll
 * settles the same payment.
 *
 * Guarantees this runs under:
 * - the balance has already been credited and the transaction has committed, so reads of
 *   the user's balance here see the new value;
 * - throwing is safe: `runPostPaymentSuccess` swallows and logs errors, so a failure here
 *   cannot make the callback report an error and cannot roll back the credited balance.
 *
 * Because the result callback waits on this, keep it short. Anything slow or externally
 * dependent (MIS calls, emails, receipts) belongs on the BullMQ queue rather than inline
 * here — enqueue the job from this function and let the worker do the work.
 */
const handlePaymentSuccess = async (context: PaymentSuccessContext): Promise<void> => {
  // TODO: put the real post-payment logic here.
  postSuccessLogger.info(
    {
      paymentId: context.paymentId,
      userId: context.userId,
      amount: context.amount,
      pgPaymentId: context.pgPaymentId,
    },
    'Post-payment success handler ran'
  );
};

/**
 * Error boundary around `handlePaymentSuccess`.
 *
 * The payment is already settled and the balance already credited by the time this runs.
 * Letting an exception escape would make the caller answer FreedomPay with an error and
 * pull it into a two-hour retry loop for a payment that actually succeeded, so failures
 * are logged and contained instead.
 */
export const runPostPaymentSuccess = async (context: PaymentSuccessContext): Promise<void> => {
  try {
    await handlePaymentSuccess(context);
  } catch (error) {
    postSuccessLogger.error(
      { err: error, paymentId: context.paymentId, userId: context.userId },
      'Post-payment success handler failed'
    );
  }
};
