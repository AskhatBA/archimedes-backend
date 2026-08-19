export type InitPaymentDto = {
  amount: number;
  description?: string;
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
