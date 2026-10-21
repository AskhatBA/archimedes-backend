import { Prisma } from '@prisma/client';
import pino from 'pino';

import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';

import { logger, logStreams } from './index';
import { toLogRow } from './log-row';

const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH_SIZE = 200;
/** While the database is down lines pile up; past this many the oldest are dropped. */
const MAX_BUFFERED = 5000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const FAILURE_REPORT_INTERVAL_MS = 60 * 1000;

let buffer: Prisma.AppLogCreateManyInput[] = [];
let inFlight: Promise<void> | null = null;
let lastFailureReportAt = 0;

/**
 * A failed write is reported straight to stderr, never through the logger: the logger
 * would hand the report back to this store, which is the thing that is failing.
 */
const reportFailure = (err: unknown) => {
  const now = Date.now();

  if (now - lastFailureReportAt < FAILURE_REPORT_INTERVAL_MS) return;

  lastFailureReportAt = now;
  process.stderr.write(
    `${JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      component: 'log-store',
      msg: 'Failed to store log lines',
      err: err instanceof Error ? err.message : String(err),
    })}\n`
  );
};

/** One write at a time; a caller arriving mid-write waits for that write. */
const flush = (): Promise<void> => {
  if (inFlight) return inFlight;
  if (buffer.length === 0) return Promise.resolve();

  const batch = buffer.slice(0, FLUSH_BATCH_SIZE);
  buffer = buffer.slice(batch.length);

  inFlight = prismaClient.appLog
    .createMany({ data: batch })
    .then(() => undefined)
    // Logs are diagnostics, not records — a lost batch is better than a stalled app.
    .catch(reportFailure)
    .finally(() => {
      inFlight = null;
      if (buffer.length >= FLUSH_BATCH_SIZE) void flush();
    });

  return inFlight;
};

const logStoreStream = {
  write(line: string) {
    const row = toLogRow(line);

    if (!row) return;

    buffer.push(row);

    if (buffer.length > MAX_BUFFERED) buffer = buffer.slice(buffer.length - MAX_BUFFERED);
    if (buffer.length >= FLUSH_BATCH_SIZE) void flush();
  },
};

const prune = async () => {
  const cutoff = new Date(Date.now() - config.logging.store.retentionDays * 24 * 60 * 60 * 1000);

  try {
    const { count } = await prismaClient.appLog.deleteMany({ where: { time: { lt: cutoff } } });

    if (count > 0) {
      logger.info({ component: 'log-store', count, cutoff }, 'Pruned old log lines');
    }
  } catch (err) {
    reportFailure(err);
  }
};

/**
 * Starts copying log lines into `AppLog` for the dashboard's log screen and pruning
 * those older than `LOG_RETENTION_DAYS`. Called once from `server.ts`, so one-off
 * scripts and tests that import the logger never touch the table.
 */
export const startLogStore = () => {
  if (!config.logging.store.enabled) return;

  logStreams.add({ level: config.logging.store.level as pino.Level, stream: logStoreStream });

  setInterval(() => void flush(), FLUSH_INTERVAL_MS).unref();
  setInterval(() => void prune(), PRUNE_INTERVAL_MS).unref();
  void prune();
};

/** Writes what is still buffered — the shutdown path calls it before the process exits. */
export const flushLogStore = async () => {
  await inFlight;

  while (buffer.length > 0) {
    await flush();
  }
};
