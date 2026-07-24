import { randomUUID } from 'node:crypto';

import { Request, Response, NextFunction } from 'express';
import { pinoHttp, Options } from 'pino-http';

import { logger, getRequestContext, runWithRequestContext } from '@/shared/lib/logger';

const REQUEST_ID_HEADER = 'x-request-id';

/** Paths that would otherwise flood the logs without telling us anything. */
const IGNORED_PATHS = ['/health', '/favicon.ico'];
const IGNORED_PREFIXES = ['/docs'];

const isIgnored = (url: string) => {
  const [path] = url.split('?');

  return IGNORED_PATHS.includes(path) || IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix));
};

/**
 * Opens the async context for a request. Must be registered before `httpLogger`
 * and before the routes, so every log line emitted while handling the request carries its `reqId`.
 */
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incomingId = req.headers[REQUEST_ID_HEADER];
  const reqId = (Array.isArray(incomingId) ? incomingId[0] : incomingId) || randomUUID();

  res.setHeader(REQUEST_ID_HEADER, reqId);

  runWithRequestContext({ reqId }, () => next());
};

const options: Options = {
  logger,
  // Keeps `req.id` aligned with the context id. The `reqId` field itself is emitted by the
  // logger's mixin, so it appears on every line and not just on the request/response ones.
  genReqId: () => getRequestContext()?.reqId ?? randomUUID(),
  autoLogging: {
    ignore: (req) => isIgnored(req.url ?? ''),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: () => 'request completed',
  customErrorMessage: () => 'request failed',
  customErrorObject: (_req, res, _error, loggableObject) => {
    // For any 5xx without a propagated error, pino-http invents a placeholder Error whose
    // stack points into pino-http itself. The real error was already logged with its own
    // stack and Sentry id by the errorHandler middleware, so drop the placeholder.
    if (res.err) return loggableObject;

    const { err: _placeholder, ...rest } = loggableObject as Record<string, unknown>;

    return rest;
  },
  serializers: {
    req(req) {
      const [path, queryString] = (req.url ?? '').split('?');

      return {
        method: req.method,
        // Path and query are kept apart so the query can be redacted by key
        // (`req.query.iin`) instead of leaking PII inside a raw URL string.
        url: path,
        ...(queryString ? { query: Object.fromEntries(new URLSearchParams(queryString)) } : {}),
        remoteAddress: req.raw.socket?.remoteAddress,
        headers: {
          'user-agent': req.headers['user-agent'],
          referer: req.headers.referer,
        },
      };
    },
    res: (res) => ({ statusCode: res.statusCode }),
  },
};

export const httpLogger = pinoHttp(options);
