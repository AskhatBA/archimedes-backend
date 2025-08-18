import jwt from 'jsonwebtoken';

import { prismaClient } from '@/infrastructure/db';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

const defaultAccessExpiresIn = '15m';
const defaultRefreshExpiresIn = '7d';

interface TokenPayload {
  userId: string;
  role: string;
}

export const generateTokenPair = (payload: TokenPayload) => {
  const accessToken = jwt.sign(payload, config.token.jwtAccessSecret!, {
    expiresIn: defaultAccessExpiresIn,
    issuer: 'archimedes-backend',
    audience: 'archimedes-app',
  });

  const refreshToken = jwt.sign(payload, config.token.jwtRefreshSecret!, {
    expiresIn: defaultRefreshExpiresIn,
    issuer: 'archimedes-backend',
    audience: 'archimedes-app',
  });

  return { accessToken, refreshToken };
};

export const saveRefreshToken = (userId: string, refreshToken: string) => {
  return prismaClient.user.update({
    where: { id: userId },
    data: { refreshToken },
  });
};

export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, config.token.jwtAccessSecret!, {
      issuer: 'archimedes-backend',
      audience: 'archimedes-app',
    }) as TokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(ErrorCodes.TOKEN_EXPIRED, 401);
    }

    if (error.name === 'JsonWebTokenError') {
      throw new AppError(ErrorCodes.INVALID_TOKEN, 401);
    }

    throw new AppError(ErrorCodes.TOKEN_VERIFICATION_FAILED, 401);
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined) => {
  if (!authHeader) {
    throw new AppError(ErrorCodes.AUTHORIZATION_HEADER_MISSING, 401);
  }

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(ErrorCodes.INVALID_TOKEN, 401);
  }

  return authHeader?.substring(7);
};
