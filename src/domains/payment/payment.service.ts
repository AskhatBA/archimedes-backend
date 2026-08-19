import crypto from 'node:crypto';

import axios from 'axios';
import { PaymentStatus } from '@prisma/client';

import * as db from '@/infrastructure/db';
import { config } from '@/config';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';

import {
  FREEDOMPAY_CURRENCY,
  FREEDOMPAY_ENDPOINTS,
  FREEDOMPAY_LANGUAGE,
  FREEDOMPAY_PAYMENT_STATUS,
  FREEDOMPAY_STATUS,
  scriptNameOf,
} from './payment.constants';
import {
  FreedomPayParams,
  FreedomPayXmlResponse,
  InitPaymentResult,
  PaymentCallbackParams,
} from './payment.dto';
import { runPostPaymentSuccess } from './payment.post-success.service';

const paymentLogger = createLogger('payment');

const freedomPayHttp = axios.create({ baseURL: config.freedomPay.apiUrl, timeout: 20_000 });

/** Amounts are floats in the DB, so equality needs a tolerance below one tiyn. */
const AMOUNT_EPSILON = 0.005;

/**
 * A PENDING payment is only reconciled against FreedomPay once it is old enough that
 * the result callback should already have arrived.
 */
const RECONCILE_AFTER_MS = 60_000;

/**
 * Fails loudly instead of signing with an empty key — a blank secret or result URL still
 * produces a well-formed request that FreedomPay silently rejects, which is far harder to
 * diagnose than a 500 here.
 */
function assertConfigured(): void {
  const { merchantId, secretKey, callbackUrl } = config.freedomPay;
  if (!merchantId || !secretKey || !callbackUrl) {
    throw new AppError('FreedomPay is not configured', 500);
  }
}

function generateSalt(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * FreedomPay signature: md5 of `script name; every field sorted by name; secret key`,
 * joined by `;`. `pg_sig` itself is excluded, and *all* fields participate — including
 * merchant parameters that do not start with `pg_`, which FreedomPay echoes back to the
 * result URL. Only flat messages are signed here; nested structures (`pg_template_params`)
 * would need the rule applied recursively.
 */
function buildSignature(scriptName: string, params: FreedomPayParams, secretKey: string): string {
  const values = Object.entries(params)
    .filter(([key, value]) => key !== 'pg_sig' && value !== undefined && value !== null)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => String(value));

  return crypto
    .createHash('md5')
    .update([scriptName, ...values, secretKey].join(';'))
    .digest('hex');
}

/** Constant-time compare so a bad signature cannot be guessed byte by byte. */
function signaturesMatch(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseXml(xml: string): FreedomPayXmlResponse {
  const result: FreedomPayXmlResponse = {};
  // Bounded quantifiers to avoid super-linear backtracking (ReDoS): tag names
  // are short and values (URLs, statuses) comfortably fit within these limits.
  const tagRegex = /<([^/>\s]{1,64})>([^<]{0,4096})<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    // Entities must be decoded: pg_redirect_url arrives with `&amp;` between query
    // parameters, and FreedomPay signs the decoded values, not the escaped ones.
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** POSTs a signed form to a FreedomPay script and returns the parsed XML response. */
async function callFreedomPay(
  endpoint: string,
  params: FreedomPayParams
): Promise<FreedomPayXmlResponse> {
  assertConfigured();

  const signed: FreedomPayParams = {
    ...params,
    pg_merchant_id: config.freedomPay.merchantId,
    pg_salt: generateSalt(),
  };
  signed.pg_sig = buildSignature(scriptNameOf(endpoint), signed, config.freedomPay.secretKey);

  const form = new URLSearchParams(
    Object.entries(signed).map(([key, value]) => [key, String(value)] as [string, string])
  );

  const { data } = await freedomPayHttp.post<string>(endpoint, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const parsed = parseXml(data);

  // FreedomPay signs its responses with the same script name. An unsigned response only
  // happens when it could not identify the merchant (pg_error_code 9998), which is
  // reported to the caller rather than treated as tampering.
  if (parsed.pg_sig) {
    const scriptName = scriptNameOf(endpoint);
    const expected = buildSignature(scriptName, parsed, config.freedomPay.secretKey);
    if (!signaturesMatch(expected, parsed.pg_sig)) {
      paymentLogger.error({ endpoint }, 'FreedomPay response signature mismatch');
      throw new AppError('Invalid response signature from payment provider', 502);
    }
  }

  return parsed;
}

export async function initPayment(
  userId: string,
  amount: number,
  description: string
): Promise<InitPaymentResult> {
  assertConfigured();

  const user = await db.prismaClient.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const payment = await db.prismaClient.payment.create({
    data: { userId, amount, description },
  });

  const params: FreedomPayParams = {
    pg_order_id: payment.id,
    pg_amount: amount,
    pg_currency: FREEDOMPAY_CURRENCY,
    pg_description: description,
    pg_language: FREEDOMPAY_LANGUAGE,
    // One-step payment: authorisation and capture happen together.
    pg_auto_clearing: 1,
    pg_lifetime: config.freedomPay.lifetimeSeconds,
    pg_testing_mode: config.freedomPay.testingMode ? 1 : 0,
    // Our payment id is unique per attempt, so a retried init cannot double-charge.
    pg_idempotency_key: payment.id,
    pg_user_id: userId,
    pg_result_url: config.freedomPay.callbackUrl,
    pg_success_url: config.freedomPay.successUrl,
    pg_failure_url: config.freedomPay.failureUrl,
  };

  if (user.phone) {
    params.pg_user_phone = user.phone.replace(/\D/g, '');
  }

  let parsed: FreedomPayXmlResponse;
  try {
    parsed = await callFreedomPay(FREEDOMPAY_ENDPOINTS.initPayment, params);
  } catch (error) {
    await db.prismaClient.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
    paymentLogger.error({ err: error, paymentId: payment.id }, 'FreedomPay init_payment failed');
    throw new AppError('Payment provider is unavailable', 502);
  }

  if (parsed.pg_status !== FREEDOMPAY_STATUS.ok || !parsed.pg_redirect_url) {
    await db.prismaClient.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
    paymentLogger.warn(
      {
        paymentId: payment.id,
        pgStatus: parsed.pg_status,
        pgErrorCode: parsed.pg_error_code,
        pgErrorDescription: parsed.pg_error_description,
      },
      'FreedomPay rejected payment initialization'
    );
    throw new AppError(parsed.pg_error_description || 'Payment initialization failed', 502);
  }

  if (parsed.pg_payment_id) {
    await db.prismaClient.payment.update({
      where: { id: payment.id },
      data: { pgPaymentId: parsed.pg_payment_id },
    });
  }

  paymentLogger.info(
    { paymentId: payment.id, pgPaymentId: parsed.pg_payment_id, amount },
    'Payment initialized'
  );

  return { paymentId: payment.id, paymentUrl: parsed.pg_redirect_url };
}

/** The two terminal states a PENDING payment can settle into. */
type SettledStatus = typeof PaymentStatus.SUCCESS | typeof PaymentStatus.FAILED;

/**
 * Moves a PENDING payment to its final state exactly once.
 *
 * FreedomPay re-delivers the result callback until it gets a signed `ok`, and the same
 * payment can also be settled by the reconciliation poll, so the balance must only be
 * credited by whichever caller wins the conditional update.
 */
async function settlePayment(
  paymentId: string,
  userId: string,
  amount: number,
  status: SettledStatus,
  pgPaymentId?: string
): Promise<boolean> {
  const settled = await db.prismaClient.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status, ...(pgPaymentId ? { pgPaymentId } : {}) },
    });

    if (count === 0) return false;

    if (status === PaymentStatus.SUCCESS) {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      });
    }

    return true;
  });

  // Fired here rather than at the call sites: this is the only point that knows the
  // payment just transitioned out of PENDING, so post-payment logic runs exactly once
  // whether the result callback or the reconciliation poll won the race. Deliberately
  // outside the transaction — the balance must stay credited even if this fails.
  if (settled && status === PaymentStatus.SUCCESS) {
    await runPostPaymentSuccess({ paymentId, userId, amount, pgPaymentId });
  }

  return settled;
}

/** Signed XML acknowledgement — FreedomPay retries the callback until it receives one. */
function buildCallbackResponse(status: string, description: string): string {
  const params: FreedomPayParams = {
    pg_status: status,
    pg_description: description,
    pg_salt: generateSalt(),
  };
  params.pg_sig = buildSignature(
    scriptNameOf(config.freedomPay.callbackUrl),
    params,
    config.freedomPay.secretKey
  );

  const body = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?><response>${body}</response>`;
}

export async function handleCallback(params: PaymentCallbackParams): Promise<string> {
  assertConfigured();

  const expectedSig = buildSignature(
    scriptNameOf(config.freedomPay.callbackUrl),
    params,
    config.freedomPay.secretKey
  );

  if (!signaturesMatch(expectedSig, params.pg_sig)) {
    paymentLogger.warn({ orderId: params.pg_order_id }, 'FreedomPay callback signature mismatch');
    return buildCallbackResponse(FREEDOMPAY_STATUS.error, 'Invalid signature');
  }

  const orderId = params.pg_order_id;
  const payment = await db.prismaClient.payment.findUnique({ where: { id: orderId } });

  if (!payment) {
    paymentLogger.warn({ orderId }, 'FreedomPay callback for unknown payment');
    return buildCallbackResponse(FREEDOMPAY_STATUS.error, 'Payment not found');
  }

  // A signature only proves the message came from FreedomPay, not that it is about the
  // amount we asked for — credit the balance only when the settled amount matches.
  const reportedAmount = Number(params.pg_amount);
  if (
    !Number.isFinite(reportedAmount) ||
    Math.abs(reportedAmount - payment.amount) > AMOUNT_EPSILON
  ) {
    paymentLogger.error(
      { paymentId: payment.id, expected: payment.amount, reported: params.pg_amount },
      'FreedomPay callback amount mismatch'
    );
    return buildCallbackResponse(FREEDOMPAY_STATUS.rejected, 'Amount mismatch');
  }

  // pg_result: 1 - success, 0 - failure, 2 - not completed yet. Only 1 and 0 are final;
  // on 2 the payment stays PENDING and a later callback (or reconciliation) settles it.
  const status =
    params.pg_result === '1'
      ? PaymentStatus.SUCCESS
      : params.pg_result === '0'
        ? PaymentStatus.FAILED
        : null;

  if (status === null) {
    paymentLogger.info(
      { paymentId: payment.id, pgResult: params.pg_result },
      'FreedomPay callback reports payment still in progress'
    );
    return buildCallbackResponse(FREEDOMPAY_STATUS.ok, 'Payment pending');
  }

  const settled = await settlePayment(
    payment.id,
    payment.userId,
    payment.amount,
    status,
    params.pg_payment_id
  );

  paymentLogger.info(
    { paymentId: payment.id, status, settled, pgPaymentId: params.pg_payment_id },
    settled ? 'Payment settled from callback' : 'Duplicate callback ignored'
  );

  return buildCallbackResponse(FREEDOMPAY_STATUS.ok, 'Payment processed');
}

/**
 * Asks FreedomPay for the authoritative state of a payment and settles it locally.
 *
 * This is the safety net for a result callback that never arrived — without it a paid
 * order would stay PENDING and the user's balance would never be credited.
 */
async function reconcilePayment(payment: {
  id: string;
  userId: string;
  amount: number;
  pgPaymentId: string | null;
}): Promise<PaymentStatus> {
  const params: FreedomPayParams = { pg_order_id: payment.id };
  if (payment.pgPaymentId) params.pg_payment_id = payment.pgPaymentId;

  let parsed: FreedomPayXmlResponse;
  try {
    parsed = await callFreedomPay(FREEDOMPAY_ENDPOINTS.getStatus, params);
  } catch (error) {
    paymentLogger.error({ err: error, paymentId: payment.id }, 'FreedomPay get_status3 failed');
    return PaymentStatus.PENDING;
  }

  if (parsed.pg_status !== FREEDOMPAY_STATUS.ok) {
    paymentLogger.warn(
      { paymentId: payment.id, pgErrorDescription: parsed.pg_error_description },
      'FreedomPay get_status3 returned an error'
    );
    return PaymentStatus.PENDING;
  }

  const paymentStatus = parsed.pg_payment_status;

  if (paymentStatus === FREEDOMPAY_PAYMENT_STATUS.success) {
    const reportedAmount = Number(parsed.pg_amount);
    if (
      !Number.isFinite(reportedAmount) ||
      Math.abs(reportedAmount - payment.amount) > AMOUNT_EPSILON
    ) {
      paymentLogger.error(
        { paymentId: payment.id, expected: payment.amount, reported: parsed.pg_amount },
        'FreedomPay status amount mismatch'
      );
      return PaymentStatus.PENDING;
    }

    const settled = await settlePayment(
      payment.id,
      payment.userId,
      payment.amount,
      PaymentStatus.SUCCESS,
      parsed.pg_payment_id
    );
    paymentLogger.info({ paymentId: payment.id, settled }, 'Payment settled from reconciliation');
    return PaymentStatus.SUCCESS;
  }

  const isFinalFailure =
    paymentStatus === FREEDOMPAY_PAYMENT_STATUS.failed ||
    paymentStatus === FREEDOMPAY_PAYMENT_STATUS.revoked ||
    paymentStatus === FREEDOMPAY_PAYMENT_STATUS.refunded;

  if (isFinalFailure) {
    await settlePayment(payment.id, payment.userId, payment.amount, PaymentStatus.FAILED);
    return PaymentStatus.FAILED;
  }

  return PaymentStatus.PENDING;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ReconciliationSweepResult {
  /** Payments queried against FreedomPay this run. */
  checked: number;
  /** How many of those reached a final state. */
  settled: number;
  /** Abandoned payments failed without asking FreedomPay. */
  expired: number;
}

/**
 * One background sweep over payments still waiting for an outcome.
 *
 * This is the server-side replacement for clients polling `/payment/status/:id`: the
 * outcome is discovered here regardless of whether anyone still has the page open, which
 * matters because a lost result callback would otherwise leave a paid order PENDING and
 * the balance never credited.
 *
 * Nothing here decides an outcome on its own — every payment goes through
 * `reconcilePayment`, so the provider's signed answer stays the only source of truth.
 */
export async function reconcilePendingPayments(): Promise<ReconciliationSweepResult> {
  const { batchSize, maxAgeMinutes, requestSpacingMs } = config.freedomPay.reconcile;
  const now = Date.now();
  const abandonedBefore = new Date(now - maxAgeMinutes * 60_000);

  // Past this age the payer is never coming back and the provider's own payment window
  // has closed, so these are failed locally instead of being queried forever.
  const abandoned = await db.prismaClient.payment.findMany({
    where: { status: PaymentStatus.PENDING, createdAt: { lt: abandonedBefore } },
    select: { id: true, userId: true, amount: true },
    take: batchSize,
  });

  let expired = 0;
  for (const payment of abandoned) {
    try {
      await settlePayment(payment.id, payment.userId, payment.amount, PaymentStatus.FAILED);
      expired += 1;
    } catch (error) {
      paymentLogger.error({ err: error, paymentId: payment.id }, 'Failed to expire payment');
    }
  }

  if (expired > 0) {
    paymentLogger.info({ expired }, 'Abandoned payments marked failed');
  }

  // Newer than RECONCILE_AFTER_MS is left alone: the result callback normally lands within
  // seconds, and asking the provider before that just burns a request.
  const due = await db.prismaClient.payment.findMany({
    where: {
      status: PaymentStatus.PENDING,
      createdAt: { lt: new Date(now - RECONCILE_AFTER_MS), gte: abandonedBefore },
    },
    select: { id: true, userId: true, amount: true, pgPaymentId: true },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let settled = 0;
  for (const [index, payment] of due.entries()) {
    // Spaced out per FreedomPay's guidance on consecutive payment API calls.
    if (index > 0 && requestSpacingMs > 0) await sleep(requestSpacingMs);

    try {
      const status = await reconcilePayment(payment);
      if (status !== PaymentStatus.PENDING) settled += 1;
    } catch (error) {
      // One unreconcilable payment must not abort the rest of the sweep.
      paymentLogger.error({ err: error, paymentId: payment.id }, 'Payment reconciliation failed');
    }
  }

  return { checked: due.length, settled, expired };
}

const PAYMENT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  description: true,
  status: true,
  pgPaymentId: true,
  createdAt: true,
} as const;

function toPublicPayment(payment: {
  id: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  pgPaymentId: string | null;
  createdAt: Date;
}) {
  return {
    id: payment.id,
    amount: payment.amount,
    description: payment.description,
    status: payment.status,
    pgPaymentId: payment.pgPaymentId,
    createdAt: payment.createdAt,
  };
}

export async function getPaymentStatus(paymentId: string, userId: string) {
  const payment = await db.prismaClient.payment.findFirst({
    where: { id: paymentId, userId },
    select: PAYMENT_SELECT,
  });

  if (!payment) return null;

  const isStale = Date.now() - payment.createdAt.getTime() > RECONCILE_AFTER_MS;
  if (payment.status !== PaymentStatus.PENDING || !isStale) {
    return toPublicPayment(payment);
  }

  const status = await reconcilePayment(payment);
  return toPublicPayment({ ...payment, status });
}

export async function getPaymentHistory(userId: string) {
  const payments = await db.prismaClient.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: PAYMENT_SELECT,
  });

  return payments.map(toPublicPayment);
}

export async function getUserBalance(userId: string) {
  const user = await db.prismaClient.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  return user?.balance ?? 0;
}
