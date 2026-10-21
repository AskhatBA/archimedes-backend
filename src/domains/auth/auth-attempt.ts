import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

export type AuthFlow = 'login' | 'registration';

/**
 * Where a sign-in or registration request got to. Handlers move `step` forward as they
 * go, so a failure records the step it happened at, not just the code it ended with.
 */
export interface AuthAttempt {
  flow: AuthFlow;
  step: string;
  phone?: string | undefined;
  iin?: string | undefined;
  userId?: string | undefined;
}

const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const dropUndefined = (value: Record<string, unknown>): Prisma.InputJsonObject =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Prisma.InputJsonObject;

const failureMetadata = (attempt: AuthAttempt, err: unknown): Prisma.InputJsonObject => {
  if (!(err instanceof AppError)) {
    // Only the name: an unexpected error's message can quote the values it choked on.
    return {
      flow: attempt.flow,
      step: attempt.step,
      reason: 'UNHANDLED',
      statusCode: 500,
      error: err instanceof Error ? err.name : 'Unknown',
    };
  }

  return {
    flow: attempt.flow,
    step: attempt.step,
    reason: err.message,
    statusCode: err.statusCode,
    ...(err.details && { upstream: dropUndefined({ ...err.details }) }),
  };
};

/**
 * Writes `AUTH_LOGIN_FAILED` for *every* way the handler can fail — an insurer outage,
 * a phone mismatch, a bad code — so the dashboard can answer "why could this person not
 * sign in" by phone or IIN, including for someone who has no account yet.
 */
export const auditAuthAttempt =
  (flow: AuthFlow, handler: (req: Request, res: Response, attempt: AuthAttempt) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    const attempt: AuthAttempt = {
      flow,
      step: 'start',
      phone: asString(req.body?.phone),
      iin: asString(req.body?.iin),
    };

    try {
      return await handler(req, res, attempt);
    } catch (err) {
      await auditLogService.log({
        event: AuditEvent.AUTH_LOGIN_FAILED,
        success: false,
        userId: attempt.userId,
        phone: attempt.phone,
        iin: attempt.iin,
        req,
        metadata: failureMetadata(attempt, err),
      });
      throw err;
    }
  };
