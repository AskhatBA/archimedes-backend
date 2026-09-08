/**
 * FreedomPay endpoint paths, relative to `config.freedomPay.apiUrl`.
 *
 * The signature script name is derived from the path (see `scriptNameOf`), so the
 * path and the name signed must never be declared separately — a mismatch between
 * them makes FreedomPay reject every request with error 9999 ("wrong signature").
 */
export const FREEDOMPAY_ENDPOINTS = {
  initPayment: '/init_payment.php',
  getStatus: '/get_status3.php',
  // Возврат средств, полный и частичный. Частичный — тот же скрипт с `pg_refund_amount`,
  // и таких по одному платежу может быть несколько, пока сумма не превысит заказ.
  refund: '/revoke.php',
} as const;

/** Currency of every payment we create. */
export const FREEDOMPAY_CURRENCY = 'KZT';

/** Language of the hosted payment page. */
export const FREEDOMPAY_LANGUAGE = 'ru';

/**
 * `pg_status` values FreedomPay sends to our result URL, and the values we send back
 * in the XML acknowledgement.
 */
export const FREEDOMPAY_STATUS = {
  ok: 'ok',
  error: 'error',
  rejected: 'rejected',
} as const;

/**
 * `pg_status` values `revoke.php` answers with.
 *
 * The refund scripts speak `success` where the payment scripts speak `ok`, and both spellings
 * are accepted rather than guessed at — a reversal misread as a failure is refunded twice by
 * an operator, and `revoke.php` takes no idempotency key to stop that.
 *
 * `pending` means FreedomPay took the reversal but has not finished it; it is an acceptance,
 * not a result, so nothing may be re-sent after seeing it.
 */
export const FREEDOMPAY_REFUND_STATUS = {
  accepted: ['ok', 'success'] as const,
  pending: 'pending',
} as const;

/**
 * `pg_payment_status` values returned by `get_status3.php`. Anything not listed here
 * (`new`, `pending`, …) means the payment is still in flight.
 */
export const FREEDOMPAY_PAYMENT_STATUS = {
  success: 'success',
  failed: 'failed',
  revoked: 'revoked',
  refunded: 'refunded',
} as const;

/**
 * Signature script name = the called script's file name, i.e. everything after the
 * last `/` and before the query string. For our own result URL this means the last
 * segment of `FREEDOMPAY_CALLBACK_URL` — FreedomPay signs its callback with whatever
 * we configured there, so it must be read from the URL rather than hardcoded.
 */
export function scriptNameOf(urlOrPath: string): string {
  const withoutQuery = urlOrPath.split('?')[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
}
