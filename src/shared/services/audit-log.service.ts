import { AuditEvent, Prisma } from '@prisma/client';
import { Request } from 'express';

import { prismaClient } from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';

const auditLogger = createLogger('audit-log');

export { AuditEvent };

interface LogOptions {
  event: AuditEvent;
  success: boolean;
  userId?: string | undefined;
  phone?: string | undefined;
  req?: Request | undefined;
  metadata?: Prisma.InputJsonObject | undefined;
}

const getIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};

export const log = async (options: LogOptions): Promise<void> => {
  const { event, success, userId, phone, req, metadata } = options;

  try {
    await prismaClient.auditLog.create({
      data: {
        event,
        success,
        userId: userId ?? null,
        phone: phone ?? null,
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
