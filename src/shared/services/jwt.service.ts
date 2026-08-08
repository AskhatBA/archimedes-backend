import crypto from 'crypto';

import jwt from 'jsonwebtoken';

import { prismaClient } from '@/infrastructure/db';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

const defaultAccessExpiresIn = '15m';
const defaultRefreshExpiresIn = '90d';

const signOptions = {
  issuer: 'archimedes-backend',
  audience: 'archimedes-app',
} as const;

// Registration tokens are signed with the access-token secret but carry this
// scope claim. `verifyAccessToken` rejects any token that has it, so a
// registration token can never be presented as a Bearer token.
const REGISTRATION_SCOPE = 'registration';
const defaultRegistrationExpiresIn = '15m';

interface TokenPayload {
  userId: string;
  role: string;
  tokenVersion: number;
}

export interface RegistrationTokenPayload {
  phone: string;
  iin: string;
  /** MIS beneficiary id, when the patient already existed in MIS at OTP time. */
  misPatientId?: string;
}

export const generateAccessToken = (payload: TokenPayload) => {
  return jwt.sign(payload, config.token.jwtAccessSecret!, {
    ...signOptions,
    expiresIn: (config.token.jwtAccessExpiresIn ||
      defaultAccessExpiresIn) as NonNullable<jwt.SignOptions['expiresIn']>,
  });
};

export const generateRefreshToken = (payload: TokenPayload) => {
  return jwt.sign(payload, config.token.jwtRefreshSecret!, {
    ...signOptions,
    expiresIn: (config.token.jwtRefreshExpiresIn ||
      defaultRefreshExpiresIn) as NonNullable<jwt.SignOptions['expiresIn']>,
  });
};

export const generateTokenPair = (payload: TokenPayload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

/**
 * Hash a token for at-rest storage. Tokens are high-entropy signed JWTs, so a
 * fast SHA-256 is appropriate (unlike low-entropy secrets such as PINs).
 * bcrypt must NOT be used here: it silently truncates input to 72 bytes, which
 * would ignore the JWT signature that lives at the end of the string.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const compareTokenHash = (token: string, hash: string | null): boolean => {
  if (!hash) {
    return false;
  }

  const candidate = Buffer.from(hashToken(token));
  const stored = Buffer.from(hash);

  if (candidate.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, stored);
};

export const saveRefreshToken = (userId: string, refreshToken: string) => {
  return prismaClient.user.update({
    where: { id: userId },
    data: { refreshTokenHash: hashToken(refreshToken) },
  });
};

export const verifyAccessToken = (token: string) => {
  try {
    const payload = jwt.verify(token, config.token.jwtAccessSecret!, signOptions) as TokenPayload & {
      scope?: string;
    };

    // A registration token proves a phone number, not an identity — it must
    // never authenticate a request.
    if (payload.scope === REGISTRATION_SCOPE) {
      throw new AppError(ErrorCodes.INVALID_TOKEN, 401);
    }

    return payload as TokenPayload;
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error.name === 'TokenExpiredError') {
      throw new AppError(ErrorCodes.TOKEN_EXPIRED, 401);
    }

    if (error.name === 'JsonWebTokenError') {
      throw new AppError(ErrorCodes.INVALID_TOKEN, 401);
    }

    throw new AppError(ErrorCodes.TOKEN_VERIFICATION_FAILED, 401);
  }
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, config.token.jwtRefreshSecret!, signOptions) as TokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(ErrorCodes.TOKEN_EXPIRED, 401);
    }

    throw new AppError(ErrorCodes.INVALID_REFRESH_TOKEN, 401);
  }
};

/**
 * Short-lived token handed out once the registration OTP has been verified. It
 * pins the phone/IIN pair the code was sent to, so the final "complete
 * registration" call cannot be pointed at a different identity.
 */
export const generateRegistrationToken = (payload: RegistrationTokenPayload) => {
  return jwt.sign({ ...payload, scope: REGISTRATION_SCOPE }, config.token.jwtAccessSecret!, {
    ...signOptions,
    expiresIn: defaultRegistrationExpiresIn,
  });
};

export const verifyRegistrationToken = (token: string): RegistrationTokenPayload => {
  let payload: RegistrationTokenPayload & { scope?: string };

  try {
    payload = jwt.verify(token, config.token.jwtAccessSecret!, signOptions) as typeof payload;
  } catch {
    throw new AppError(ErrorCodes.INVALID_REGISTRATION_TOKEN, 401);
  }

  if (payload.scope !== REGISTRATION_SCOPE || !payload.phone || !payload.iin) {
    throw new AppError(ErrorCodes.INVALID_REGISTRATION_TOKEN, 401);
  }

  return {
    phone: payload.phone,
    iin: payload.iin,
    ...(payload.misPatientId && { misPatientId: payload.misPatientId }),
  };
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
