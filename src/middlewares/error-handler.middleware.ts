import * as console from 'node:console';

import { Request, Response, NextFunction } from 'express';

import { AppError } from '@/shared/services/app-error.service';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  console.log('error: ', JSON.stringify(err));

  return res.status(500).json({
    success: false,
    message: 'Something went wrong!',
  });
}
