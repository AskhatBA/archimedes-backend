import crypto from 'crypto';

import bcrypt from 'bcryptjs';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

/**
 * Dashboard passwords are typed by one human at login time, so a high cost is
 * affordable here (unlike a per-request hash) and makes an offline crack of the
 * stolen hash far slower.
 */
const BCRYPT_ROUNDS = 12;

const MIN_LENGTH = 12;

/** bcrypt silently ignores everything past 72 bytes — reject instead of truncating. */
const MAX_BYTES = 72;

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const verifyPassword = (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Enforced when a password is *set* (by the admin provisioning script), never at
 * login — an old password that no longer meets the policy must still be able to
 * sign in and be changed.
 */
export const assertValidPasswordFormat = (password: unknown): void => {
  if (typeof password !== 'string') {
    throw new AppError(ErrorCodes.INVALID_PASSWORD_FORMAT, 400);
  }

  const tooShort = password.length < MIN_LENGTH;
  const tooLong = Buffer.byteLength(password, 'utf8') > MAX_BYTES;
  const lacksVariety = !/[A-Za-z]/.test(password) || !/\d/.test(password);

  if (tooShort || tooLong || lacksVariety) {
    throw new AppError(ErrorCodes.INVALID_PASSWORD_FORMAT, 400);
  }
};

/**
 * Burn the same bcrypt work as a real check when there is no account to check
 * against, so a missing/non-admin email cannot be told apart from a wrong
 * password by response time.
 *
 * The decoy hash is generated once, lazily, from random bytes — a hardcoded
 * string would either be crackable or (if malformed) make `compare` return
 * instantly and defeat the whole point.
 */
let decoyHash: string | null = null;

export const burnPasswordComparison = async (password: string): Promise<false> => {
  decoyHash ??= await hashPassword(crypto.randomBytes(32).toString('hex'));
  await verifyPassword(password, decoyHash);

  return false;
};
