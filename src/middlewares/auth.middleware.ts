import { Request, Response, NextFunction } from 'express';
import { Doctor, Patient } from '@prisma/client';

import { asyncHandler } from '@/shared/services/async-handler.service';
import * as jwtService from '@/shared/services/jwt.service';
import { prismaClient } from '@/infrastructure/db';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        phone: string;
        role: string;
        patient?: Patient | null;
        doctor?: Doctor | null;
      };
    }
  }
}

export const authenticate = asyncHandler(async (req: Request, _: Response, next: NextFunction) => {
  const token = jwtService.extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    throw new AppError(ErrorCodes.INVALID_TOKEN, 401);
  }

  const decoded = jwtService.verifyAccessToken(token);

  if (!decoded) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const user = await prismaClient.user.findUnique({
    where: { id: decoded.userId },
    include: {
      patient: true,
      doctor: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 401);
  }

  req.user = {
    id: user.id,
    phone: user.phone,
    role: user.role,
    patient: user.patient,
    doctor: user.doctor,
  };

  next();
});
