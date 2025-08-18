import { Request, Response } from 'express';

import { AppError } from '@/shared/services/app-error.service';

export function errorHandler(err: Error, _: Request, res: Response) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Something went wrong!',
  });
}
