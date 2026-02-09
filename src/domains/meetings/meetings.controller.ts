import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import * as meetingsService from './meetings.service';

export const createMeeting = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await body('topic').notEmpty().withMessage('Topic is required').run(req);
  await body('start_time')
    .notEmpty()
    .isISO8601()
    .withMessage('Valid start_time (ISO 8601) is required')
    .run(req);
  await body('duration')
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage('Duration in minutes is required')
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { topic, start_time, duration } = req.body;

  const meeting = await meetingsService.createMeeting({
    topic,
    start_time,
    duration,
  });

  return res.status(200).json({
    success: true,
    meeting,
  });
};
