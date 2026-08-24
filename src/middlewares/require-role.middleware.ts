import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

/**
 * Gate a route on the caller's role. Must be registered *after* `authenticate`,
 * which is what puts `req.user` (and its role) on the request.
 *
 * This is what keeps a patient's perfectly valid mobile token out of the
 * dashboard: the token authenticates fine, then fails here with 403.
 */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      throw new AppError(ErrorCodes.FORBIDDEN, 403);
    }

    next();
  };
