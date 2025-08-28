import { Request, Response } from 'express';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import * as misService from './mis.service';

export const findPatient = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const patient = await misService.findPatientByPhone(`8${req.user.phone.slice(1)}`);

  return res.status(200).json({
    success: true,
    patient,
  });
};

export const createPatient = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await misService.createPatient(req.body);

  return res.status(200).json({
    success: true,
    description: 'Patient created',
  });
};
