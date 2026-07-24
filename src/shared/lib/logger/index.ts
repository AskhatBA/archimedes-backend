import pino from 'pino';

import { config } from '@/config';

import { getRequestContext } from './request-context';
import { redactPaths, REDACTION_CENSOR } from './redact';

const transport = config.logging.pretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,env',
        singleLine: false,
      },
    }
  : undefined;

export const logger = pino({
  level: config.logging.level,
  base: { env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Log the level as "info"/"error" instead of pino's numeric codes — aggregators filter on it.
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: redactPaths,
    censor: REDACTION_CENSOR,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  // Pulls the current request's id/user into every log line, however deep in the call stack
  // it was emitted, without passing a logger around.
  mixin() {
    const context = getRequestContext();

    if (!context) return {};

    return {
      reqId: context.reqId,
      ...(context.userId ? { userId: context.userId } : {}),
      ...(context.role ? { role: context.role } : {}),
    };
  },
  ...(transport ? { transport } : {}),
});

/**
 * Named logger for a subsystem, e.g. `createLogger('mis')`.
 * Adds `component` to every line so a single filter isolates that subsystem's logs.
 */
export const createLogger = (component: string) => logger.child({ component });

export type Logger = pino.Logger;

export { getRequestContext, runWithRequestContext, setRequestContextUser } from './request-context';
export type { RequestContext } from './request-context';
