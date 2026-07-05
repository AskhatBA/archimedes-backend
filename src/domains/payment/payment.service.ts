import crypto from 'node:crypto';
import axios from 'axios';
import { PaymentStatus } from '@prisma/client';

import * as db from '@/infrastructure/db';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';

import { FREEDOMPAY_INIT_SCRIPT, FREEDOMPAY_CALLBACK_SCRIPT } from './payment.constants';
import { FreedomPayXmlResponse, InitPaymentResult } from './payment.dto';

const freedomPayHttp = axios.create({ baseURL: config.freedomPay.apiUrl });

function generateSalt(): string {
  return crypto.randomBytes(8).toString('hex');
}

function buildSignature(
  scriptName: string,
  params: Record<string, string | number>,
  secretKey: string,
): string {
  const pgParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('pg_') && key !== 'pg_sig') {
      pgParams[key] = String(value);
    }
  }
  const sortedValues = Object.keys(pgParams)
    .sort()
    .map((key) => pgParams[key]);
  return crypto
    .createHash('md5')
    .update([scriptName, ...sortedValues, secretKey].join(';'))
    .digest('hex');
}

function parseXml(xml: string): FreedomPayXmlResponse {
  const result: FreedomPayXmlResponse = {};
  const tagRegex = /<([^/>\s]+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

export async function initPayment(
  userId: string,
  amount: number,
  description: string,
): Promise<InitPaymentResult> {
  const payment = await db.prismaClient.payment.create({
    data: { userId, amount, description },
  });

  const salt = generateSalt();
  const params: Record<string, string | number> = {
    pg_merchant_id: config.freedomPay.merchantId,
    pg_order_id: payment.id,
    pg_amount: amount,
    pg_currency: 'KZT',
    pg_description: description,
    pg_salt: salt,
    pg_auto_clearing: 1,
    pg_result_url: config.freedomPay.callbackUrl,
    pg_success_url: config.freedomPay.successUrl,
    pg_failure_url: config.freedomPay.failureUrl,
    pg_language: 'ru',
  };

  params.pg_sig = buildSignature(FREEDOMPAY_INIT_SCRIPT, params, config.freedomPay.secretKey);

  const formData = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
  );

  const { data } = await freedomPayHttp.post<string>('/init_payment', formData.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const parsed = parseXml(data);

  if (parsed.pg_status === 'error') {
    await db.prismaClient.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
    throw new AppError(parsed.pg_error_description || 'Payment initialization failed', 502);
  }

  if (parsed.pg_payment_id) {
    await db.prismaClient.payment.update({
      where: { id: payment.id },
      data: { pgPaymentId: parsed.pg_payment_id },
    });
  }

  return {
    paymentId: payment.id,
    paymentUrl: parsed.pg_redirect_url!,
  };
}

export async function handleCallback(params: Record<string, string>): Promise<string> {
  const { pg_sig, pg_order_id, pg_payment_id, pg_status } = params;

  const expectedSig = buildSignature(
    FREEDOMPAY_CALLBACK_SCRIPT,
    params,
    config.freedomPay.secretKey,
  );
  if (expectedSig !== pg_sig) {
    throw new AppError('Invalid signature', 400);
  }

  const payment = await db.prismaClient.payment.findUnique({ where: { id: pg_order_id } });
  if (!payment) throw new AppError('Payment not found', 404);

  if (pg_status === 'ok') {
    await db.prismaClient.$transaction([
      db.prismaClient.payment.update({
        where: { id: pg_order_id },
        data: { status: PaymentStatus.SUCCESS, pgPaymentId: pg_payment_id },
      }),
      db.prismaClient.user.update({
        where: { id: payment.userId },
        data: { balance: { increment: payment.amount } },
      }),
    ]);
  } else {
    await db.prismaClient.payment.update({
      where: { id: pg_order_id },
      data: { status: PaymentStatus.FAILED },
    });
  }

  // FreedomPay expects a signed XML acknowledgement
  const responseSalt = generateSalt();
  const responseParams = { pg_status: 'ok', pg_salt: responseSalt };
  const responseSig = buildSignature(
    FREEDOMPAY_CALLBACK_SCRIPT,
    responseParams,
    config.freedomPay.secretKey,
  );
  return `<?xml version="1.0" encoding="utf-8"?><response><pg_status>ok</pg_status><pg_salt>${responseSalt}</pg_salt><pg_sig>${responseSig}</pg_sig></response>`;
}

export async function getPaymentStatus(paymentId: string, userId: string) {
  return db.prismaClient.payment.findFirst({
    where: { id: paymentId, userId },
    select: { id: true, amount: true, description: true, status: true, pgPaymentId: true, createdAt: true },
  });
}

export async function getPaymentHistory(userId: string) {
  return db.prismaClient.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, description: true, status: true, pgPaymentId: true, createdAt: true },
  });
}

export async function getUserBalance(userId: string) {
  const user = await db.prismaClient.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  return user?.balance ?? 0;
}