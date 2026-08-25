import { PaymentPurpose } from '@prisma/client';

export type InitPaymentDto = {
  amount: number;
  description?: string;
  purpose?: PaymentPurpose;
  /** Payload for the purpose's post-success handler; shape is owned by that handler. */
  metadata?: unknown;
};

export type InitPaymentResult = {
  paymentId: string;
  paymentUrl: string;
};

/** A flat FreedomPay message — both the form we post and the XML we parse back. */
export type FreedomPayParams = Record<string, string | number>;

/** Parsed `<response>` body returned by every FreedomPay script. */
export type FreedomPayXmlResponse = Record<string, string>;

/** Form-encoded body FreedomPay posts to our `pg_result_url`. */
export type PaymentCallbackParams = Record<string, string>;
