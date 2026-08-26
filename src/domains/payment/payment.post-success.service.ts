import { PaymentPurpose, Prisma } from '@prisma/client';

import * as db from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';

const postSuccessLogger = createLogger('payment-post-success');

export interface PaymentSuccessContext {
  /** Our own payment record id (sent to FreedomPay as pg_order_id). */
  paymentId: string;
  userId: string;
  /** Amount credited to the user's balance, in KZT. */
  amount: number;
  /** FreedomPay transaction id, absent only if the provider never reported one. */
  pgPaymentId?: string | undefined;
  /** What the payment was for — selects the handler that runs here. */
  purpose: PaymentPurpose;
  /** Payload stored at init time, already validated by the handler's `validateMetadata`. */
  metadata: Prisma.JsonValue | null;
}

/**
 * Everything a purpose needs to plug into the payment lifecycle.
 *
 * `validateMetadata` runs synchronously at `/payment/init` — before the user is sent to
 * the provider — so a malformed payload is rejected while nobody has paid yet. Whatever
 * it returns is what gets stored on the payment and handed back to `onSuccess`.
 *
 * `onSuccess` runs exactly once, at the moment the payment leaves PENDING for SUCCESS,
 * no matter which path settled it (the FreedomPay result callback or the background
 * reconciliation sweep).
 */
export interface PaymentPurposeHandler<TMetadata = unknown> {
  /**
   * Validates and normalises the metadata for this purpose. Throw an `AppError` to
   * reject the init request. Omit it for purposes that carry no payload.
   */
  validateMetadata?: (metadata: unknown) => TMetadata;
  /**
   * Last check before the user is sent to the provider, with everything the purpose needs
   * to look up. Throw an `AppError` to refuse the payment.
   *
   * This is where a purpose rejects an order it would not be able to fulfil anyway — the
   * alternative is discovering it in `onSuccess`, when the money has already moved and
   * the only options left are a manual refund or a lost payment.
   */
  beforePayment?: (context: { userId: string; metadata: TMetadata }) => Promise<void>;
  /** Business logic to run once the payment is confirmed successful. */
  onSuccess: (context: PaymentSuccessContext) => Promise<void>;
}

// Metadata types differ per purpose, so the registry stores them opaquely: each handler
// only ever sees the payload its own `validateMetadata` produced.
const handlers = new Map<PaymentPurpose, PaymentPurposeHandler<unknown>>();

/**
 * Attaches business logic to a payment purpose.
 *
 * Register from a module that is imported at startup (see
 * `payment.success-handlers.ts`) — registration has to happen before the first payment
 * settles, and before the first `/payment/init` for that purpose.
 */
export const registerPaymentPurposeHandler = <TMetadata>(
  purpose: PaymentPurpose,
  handler: PaymentPurposeHandler<TMetadata>
): void => {
  if (handlers.has(purpose)) {
    postSuccessLogger.warn({ purpose }, 'Payment purpose handler replaced');
  }
  handlers.set(purpose, handler as PaymentPurposeHandler<unknown>);
};

/**
 * Validates the metadata a caller wants to attach to a new payment.
 *
 * A purpose with no handler is only allowed to carry no metadata at all — otherwise the
 * payload would be stored and then silently ignored on success.
 */
export const validatePaymentMetadata = (
  purpose: PaymentPurpose,
  metadata: unknown
): Prisma.InputJsonValue | undefined => {
  const handler = handlers.get(purpose);

  if (!handler?.validateMetadata) {
    if (metadata === undefined || metadata === null) return undefined;
    throw new AppError(`Payment purpose ${purpose} does not accept metadata`, 400);
  }

  return handler.validateMetadata(metadata) as Prisma.InputJsonValue;
};

/**
 * Runs the purpose's pre-flight check, if it has one.
 *
 * Called from `initPayment` with the metadata `validatePaymentMetadata` just normalised,
 * before the payment record exists. Errors propagate to the caller — this is meant to
 * fail the init request.
 */
export const runBeforePayment = async (
  purpose: PaymentPurpose,
  userId: string,
  metadata: unknown
): Promise<void> => {
  const handler = handlers.get(purpose);
  if (!handler?.beforePayment) return;

  await handler.beforePayment({ userId, metadata });
};

/**
 * Dispatches to the handler registered for the payment's purpose.
 *
 * Called from `settlePayment` at the single point that knows a payment just moved out of
 * PENDING, so it runs **exactly once per payment** — never again on the callback retries
 * FreedomPay sends for two hours, and not a second time when the reconciliation poll
 * settles the same payment.
 *
 * Guarantees a handler runs under:
 * - the balance has already been credited and the transaction has committed, so reads of
 *   the user's balance here see the new value;
 * - throwing is safe: `runPostPaymentSuccess` swallows and logs errors, so a failure here
 *   cannot make the callback report an error and cannot roll back the credited balance.
 *
 * Because the result callback waits on this, keep handlers short. Anything slow or
 * externally dependent (emails, receipts) belongs on the BullMQ queue rather than inline
 * — enqueue the job from the handler and let the worker do the work.
 */
const handlePaymentSuccess = async (context: PaymentSuccessContext): Promise<void> => {
  const handler = handlers.get(context.purpose);

  if (!handler) {
    postSuccessLogger.info(
      {
        paymentId: context.paymentId,
        userId: context.userId,
        amount: context.amount,
        purpose: context.purpose,
      },
      'Payment succeeded with no purpose handler registered'
    );
    return;
  }

  await handler.onSuccess(context);

  postSuccessLogger.info(
    {
      paymentId: context.paymentId,
      userId: context.userId,
      amount: context.amount,
      pgPaymentId: context.pgPaymentId,
      purpose: context.purpose,
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
      {
        err: error,
        paymentId: context.paymentId,
        userId: context.userId,
        purpose: context.purpose,
      },
      'Post-payment success handler failed'
    );

    // Recorded on the payment so the failure is not invisible: the payer has been charged
    // and whatever they paid for did not happen, which the app surfaces and support can
    // act on. Best effort — the payment stays settled even if this write fails.
    try {
      await db.prismaClient.payment.update({
        where: { id: context.paymentId },
        data: { postSuccessError: String((error as Error)?.message || error).slice(0, 500) },
      });
    } catch (updateError) {
      postSuccessLogger.error(
        { err: updateError, paymentId: context.paymentId },
        'Failed to record post-payment handler error'
      );
    }
  }
};
