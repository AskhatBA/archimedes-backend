import { Prisma } from '@prisma/client';

/** A line longer than this is kept as a preview — one huge payload must not bloat the table. */
const MAX_LINE_LENGTH = 64 * 1024;

/** The dashboard polling its own log screen would otherwise fill the table with itself. */
const UNSTORED_URLS = ['/v1/api/audit/admin/logs'];

type LogLine = Record<string, unknown> & {
  time?: string;
  level?: string;
  msg?: string;
  reqId?: string;
  userId?: string;
  component?: string;
  req?: { method?: string; url?: string };
  res?: { statusCode?: number };
};

const asString = (value: unknown) => (typeof value === 'string' ? value : null);
const asInt = (value: unknown) => (typeof value === 'number' ? Math.round(value) : null);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pulls the columns the dashboard filters on out of a pino line. Request lines carry
 * `req`/`res` (pino-http), the error handler's lines carry `method`/`url`/`statusCode`
 * at the top level, and upstream calls log their own `durationMs`.
 */
export const toLogRow = (line: string): Prisma.AppLogCreateManyInput | null => {
  let entry: LogLine;

  try {
    entry = JSON.parse(line) as LogLine;
  } catch {
    return null;
  }

  const url = asString(entry.req?.url) ?? asString(entry.url);

  if (url && UNSTORED_URLS.includes(url)) return null;

  const userId = asString(entry.userId);

  return {
    time: entry.time ? new Date(entry.time) : new Date(),
    level: asString(entry.level) ?? 'info',
    msg: asString(entry.msg),
    reqId: asString(entry.reqId),
    userId: userId && UUID_REGEX.test(userId) ? userId : null,
    component: asString(entry.component),
    method: asString(entry.req?.method) ?? asString(entry.method),
    url,
    statusCode: asInt(entry.res?.statusCode) ?? asInt(entry.statusCode),
    durationMs: asInt(entry.responseTime) ?? asInt(entry.durationMs),
    data:
      line.length > MAX_LINE_LENGTH
        ? { truncated: true, preview: line.slice(0, MAX_LINE_LENGTH) }
        : (entry as Prisma.InputJsonObject),
  };
};
