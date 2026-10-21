import { Prisma } from '@prisma/client';

import * as db from '@/infrastructure/db';

import { AuthAttemptSearch, LogSearch } from './audit.search';

export type LogLevelFilter = 'warn' | 'error';

const LEVELS_AT_LEAST: Record<LogLevelFilter, string[]> = {
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
};

/** How many of a person's latest sign-in attempts are followed into the logs. */
const ATTEMPTS_FOLLOWED = 200;
/** A single request rarely logs more than a handful of lines; this is a safety cap. */
const REQUEST_LINES_MAX = 500;

export interface AppLogListParams {
  search: LogSearch | null;
  /** Every line of one request, oldest first — the drawer's request timeline. */
  reqId: string | undefined;
  level: LogLevelFilter | undefined;
  from: Date | undefined;
  to: Date | undefined;
  /** Cursor: only lines older than this id. */
  before: bigint | undefined;
  limit: number;
}

/**
 * Logs never hold a phone or IIN — they are redacted — so a person is found through
 * what does: their account's `userId` on every authenticated request, and the `reqId`
 * our audit trail stored for each of their sign-in attempts. The second is the only
 * way to reach someone who has no account yet.
 */
const resolvePerson = async (search: AuthAttemptSearch) => {
  const [users, attempts] = await Promise.all([
    db.prismaClient.user.findMany({
      where: 'iin' in search ? { patient: { iin: search.iin } } : { phone: search.phone },
      select: { id: true },
    }),
    db.prismaClient.auditLog.findMany({
      where: 'iin' in search ? { iin: search.iin } : { phone: search.phone },
      orderBy: { createdAt: 'desc' },
      take: ATTEMPTS_FOLLOWED,
      select: { metadata: true },
    }),
  ]);

  const reqIds = [
    ...new Set(
      attempts
        .map(({ metadata }) => (metadata as { reqId?: unknown } | null)?.reqId)
        .filter((reqId): reqId is string => typeof reqId === 'string')
    ),
  ];

  return { userIds: users.map((user) => user.id), reqIds };
};

const searchWhere = async (
  search: LogSearch
): Promise<{ where: Prisma.AppLogWhereInput; person: { accounts: number; attempts: number } | null }> => {
  if ('person' in search) {
    const { userIds, reqIds } = await resolvePerson(search.person);

    return {
      // Empty `OR` matches nothing — which is the right answer for someone we never saw.
      where: {
        OR: [
          ...(userIds.length ? [{ userId: { in: userIds } }] : []),
          ...(reqIds.length ? [{ reqId: { in: reqIds } }] : []),
        ],
      },
      person: { accounts: userIds.length, attempts: reqIds.length },
    };
  }

  if ('id' in search) {
    return { where: { OR: [{ reqId: search.id }, { userId: search.id }] }, person: null };
  }

  return {
    where: {
      OR: [
        { url: { contains: search.text, mode: 'insensitive' } },
        { msg: { contains: search.text, mode: 'insensitive' } },
        { component: search.text },
      ],
    },
    person: null,
  };
};

/** Who each line belongs to, for the "Кто" column — one query for the whole page. */
const describeUsers = async (userIds: string[]) => {
  if (userIds.length === 0) return new Map<string, { phone: string; name: string | null }>();

  const users = await db.prismaClient.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, phone: true, patient: { select: { fullName: true } } },
  });

  return new Map(
    users.map((user) => [user.id, { phone: user.phone, name: user.patient?.fullName || null }])
  );
};

export const getAppLogs = async ({
  search,
  reqId,
  level,
  from,
  to,
  before,
  limit,
}: AppLogListParams) => {
  const { where: searchFilter, person } = search
    ? await searchWhere(search)
    : { where: {}, person: null };

  const where: Prisma.AppLogWhereInput = {
    AND: [
      searchFilter,
      ...(reqId ? [{ reqId }] : []),
      ...(level ? [{ level: { in: LEVELS_AT_LEAST[level] } }] : []),
      ...(from || to ? [{ time: { ...(from && { gte: from }), ...(to && { lte: to }) } }] : []),
      ...(before !== undefined ? [{ id: { lt: before } }] : []),
    ],
  };

  const take = reqId ? REQUEST_LINES_MAX : limit + 1;
  const rows = await db.prismaClient.appLog.findMany({
    where,
    // A request reads top to bottom; the feed reads newest first.
    orderBy: { id: reqId ? 'asc' : 'desc' },
    take,
  });

  const hasMore = !reqId && rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const users = await describeUsers([
    ...new Set(page.map((row) => row.userId).filter((id): id is string => id !== null)),
  ]);

  return {
    items: page.map((row) => {
      const user = row.userId ? users.get(row.userId) : undefined;

      return {
        ...row,
        // BigInt does not survive JSON.stringify.
        id: row.id.toString(),
        userPhone: user?.phone ?? null,
        userName: user?.name ?? null,
      };
    }),
    nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
    person,
  };
};
