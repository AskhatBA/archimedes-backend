import { Request, Response, NextFunction } from 'express';
import Sentry from '@sentry/node';

import { AppError } from '@/shared/services/app-error.service';
import { logger } from '@/shared/lib/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestInfo = {
    method: req.method,
    url: req.originalUrl.split('?')[0],
  };

  if (err instanceof AppError) {
    // Expected failures (validation, not found, auth) — logged, but not sent to Sentry.
    const level = err.statusCode >= 500 ? 'error' : 'warn';

    logger[level](
      { ...requestInfo, statusCode: err.statusCode, err },
      'Request rejected with application error'
    );

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  const sentryEventId = Sentry.captureException(err);

  // sentryEventId links the log line to the Sentry issue, so an alert in either
  // system leads straight to the other.
  logger.error({ ...requestInfo, statusCode: 500, sentryEventId, err }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    message: 'Something went wrong!',
  });
}
