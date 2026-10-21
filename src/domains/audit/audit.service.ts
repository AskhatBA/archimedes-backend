import { AuditEvent, Prisma } from '@prisma/client';

import * as db from '@/infrastructure/db';

import { AuthAttemptSearch } from './audit.search';

/**
 * What someone did to get into the app, or failed to. `AUTH_TOKEN_REFRESHED` is left
 * out on purpose: it fires on every unlock and would bury the attempts that matter.
 */
export const AUTH_ATTEMPT_EVENTS: AuditEvent[] = [
  AuditEvent.AUTH_OTP_REQUEST,
  AuditEvent.AUTH_LOGIN_SUCCESS,
  AuditEvent.AUTH_LOGIN_FAILED,
  AuditEvent.AUTH_LOGOUT,
  AuditEvent.AUTH_REFRESH_FAILED,
  AuditEvent.AUTH_PIN_VERIFY_SUCCESS,
  AuditEvent.AUTH_PIN_VERIFY_FAILED,
  AuditEvent.AUTH_PIN_LOCKED,
  AuditEvent.USER_ACCOUNT_CREATED,
  AuditEvent.USER_PHONE_CHANGED,
];

export interface AuthAttemptListParams {
  page: number;
  limit: number;
  search: AuthAttemptSearch | null;
  success: boolean | undefined;
}

/**
 * An attempt is matched by what was typed (`phone` / `iin` on the entry — the only
 * handle on someone with no account) and, when the person has an account, by `userId`,
 * which also brings in the PIN and logout events that carry no IIN.
 */
const searchWhere = async (search: AuthAttemptSearch): Promise<Prisma.AuditLogWhereInput[]> => {
  const users = await db.prismaClient.user.findMany({
    where: 'iin' in search ? { patient: { iin: search.iin } } : { phone: search.phone },
    select: { id: true },
  });

  return [
    'iin' in search ? { iin: search.iin } : { phone: search.phone },
    ...(users.length ? [{ userId: { in: users.map((user) => user.id) } }] : []),
  ];
};

export const getAuthAttempts = async ({ page, limit, search, success }: AuthAttemptListParams) => {
  const where: Prisma.AuditLogWhereInput = {
    event: { in: AUTH_ATTEMPT_EVENTS },
    ...(success !== undefined && { success }),
    ...(search && { OR: await searchWhere(search) }),
  };

  const [total, rows] = await Promise.all([
    db.prismaClient.auditLog.count({ where }),
    db.prismaClient.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        event: true,
        success: true,
        createdAt: true,
        userId: true,
        phone: true,
        iin: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        user: { select: { phone: true, patient: { select: { fullName: true, iin: true } } } },
      },
    }),
  ]);

  return {
    items: rows.map(({ user, ...row }) => ({
      ...row,
      patientName: user?.patient?.fullName || null,
      // Older entries were written without an IIN; the account's own fills the gap.
      iin: row.iin ?? user?.patient?.iin ?? null,
      phone: row.phone ?? user?.phone ?? null,
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};
