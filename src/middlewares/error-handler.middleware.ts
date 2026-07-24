import { Request, Response, NextFunction } from 'express';
import Sentry from '@sentry/node';

import { AppError } from '@/shared/services/app-error.service';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  Sentry.captureException(err);

  return res.status(500).json({
    success: false,
    message: 'Something went wrong!',
  });
}
