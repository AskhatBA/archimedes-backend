import pino from 'pino';
import pretty from 'pino-pretty';

import { config } from '@/config';

import { getRequestContext } from './request-context';
import { redactPaths, REDACTION_CENSOR } from './redact';

const stdout = config.logging.pretty
  ? pretty({
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,env',
      singleLine: false,
    })
  : pino.destination(1);

/**
 * Every destination a log line goes to. stdout is always on; the server adds the
 * `AppLog` table on start (`startLogStore`), so scripts and tests never write there.
 */
export const logStreams = pino.multistream([{ level: config.logging.level, stream: stdout }]);

/**
 * An axios error serialises with its whole `config` — query params (an IIN sat in
 * `config.params`, deeper than the redact paths reach), the request body and every
 * header — plus the raw request and response objects. Only what names the call is kept;
 * the upstream answer is logged separately as `responseData`, where redaction applies.
 */
const serializeError = (err: Error) => {
  const serialized = pino.stdSerializers.err(err) as unknown as Record<string, unknown>;
  const { config: requestConfig, request: _request, response: _response, ...rest } = serialized;

  if (!requestConfig || typeof requestConfig !== 'object') return rest;

  const { method, baseURL, url } = requestConfig as Record<string, unknown>;

  return { ...rest, config: { method, baseURL, url } };
};

export const logger = pino(
  {
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
      err: serializeError,
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
  },
  logStreams
);

/**
 * Named logger for a subsystem, e.g. `createLogger('mis')`.
 * Adds `component` to every line so a single filter isolates that subsystem's logs.
 */
export const createLogger = (component: string) => logger.child({ component });

export type Logger = pino.Logger;

export { getRequestContext, runWithRequestContext, setRequestContextUser } from './request-context';
export type { RequestContext } from './request-context';
