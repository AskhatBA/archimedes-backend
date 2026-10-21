import { AuditEvent, Prisma } from '@prisma/client';
import { Request } from 'express';

import { prismaClient } from '@/infrastructure/db';
import { createLogger, getRequestContext } from '@/shared/lib/logger';

const auditLogger = createLogger('audit-log');

export { AuditEvent };

/** Sent by the mobile app as `1.20 (4) ios` — the User-Agent carries only the build number. */
const APP_VERSION_HEADER = 'x-app-version';

interface LogOptions {
  event: AuditEvent;
  success: boolean;
  userId?: string | undefined;
  phone?: string | undefined;
  iin?: string | undefined;
  req?: Request | undefined;
  metadata?: Prisma.InputJsonObject | undefined;
}

const getIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};

/**
 * `reqId` ties the entry to the request's log lines, and the app version tells which
 * build of the app made the request — both are what an investigation starts from.
 */
const withRequestTrace = (
  req: Request | undefined,
  metadata: Prisma.InputJsonObject | undefined
): Prisma.InputJsonObject | undefined => {
  const reqId = getRequestContext()?.reqId;
  const appVersion = req?.headers[APP_VERSION_HEADER];
  const trace = {
    ...(reqId && { reqId }),
    ...(typeof appVersion === 'string' && { appVersion }),
  };

  if (!metadata && Object.keys(trace).length === 0) return undefined;

  return { ...trace, ...metadata };
};

export const log = async (options: LogOptions): Promise<void> => {
  const { event, success, userId, phone, iin, req } = options;
  const metadata = withRequestTrace(req, options.metadata);

  try {
    await prismaClient.auditLog.create({
      data: {
        event,
        success,
        userId: userId ?? null,
        phone: phone ?? null,
        iin: iin ?? null,
        ipAddress: req ? getIp(req) : null,
        userAgent: req ? (req.headers['user-agent'] ?? null) : null,
        ...(metadata !== undefined && { metadata }),
      },
    });
  } catch (err) {
    // The audit trail is a compliance record — if the DB write fails, the event must at
    // least survive in the logs.
    auditLogger.error({ err, event, success, userId }, 'Failed to write audit log entry');
  }
};
