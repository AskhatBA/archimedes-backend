import bcrypt from 'bcryptjs';

import { redisConnection } from '@/infrastructure/redis';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

/**
 * OTP storage for registrations in progress.
 *
 * The `OTP` table is keyed by `userId`, but during registration no user row
 * exists yet — creating one up front is exactly what this feature removes. So
 * pending codes live in Redis under the phone/IIN pair they were issued for and
 * expire on their own.
 */

const OTP_TTL_SECONDS = 5 * 60;
const ATTEMPTS_LIMIT = 5;

const otpKey = (phone: string, iin: string) => `registration:otp:${phone}:${iin}`;
const attemptsKey = (phone: string, iin: string) => `registration:otp-attempts:${phone}:${iin}`;

export const saveRegistrationOtp = async (
  phone: string,
  iin: string,
  hashedOtp: string
): Promise<void> => {
  await redisConnection.set(otpKey(phone, iin), hashedOtp, 'EX', OTP_TTL_SECONDS);
  await redisConnection.del(attemptsKey(phone, iin));
};

/**
 * Consumes the pending code: a successful check deletes it, so a code can be
 * exchanged for a registration token exactly once. Wrong guesses are counted
 * and the code is dropped after `ATTEMPTS_LIMIT` of them.
 */
export const validateRegistrationOtp = async (
  phone: string,
  iin: string,
  otp: string
): Promise<void> => {
  const key = otpKey(phone, iin);
  const storedHash = await redisConnection.get(key);

  if (!storedHash) {
    throw new AppError(ErrorCodes.OTP_EXPIRED, 400);
  }

  const isValid = typeof otp === 'string' && (await bcrypt.compare(otp, storedHash));

  if (!isValid) {
    const attempts = await redisConnection.incr(attemptsKey(phone, iin));
    await redisConnection.expire(attemptsKey(phone, iin), OTP_TTL_SECONDS);

    if (attempts >= ATTEMPTS_LIMIT) {
      await redisConnection.del(key);
      await redisConnection.del(attemptsKey(phone, iin));
    }

    throw new AppError(ErrorCodes.INVALID_OTP, 400);
  }

  await redisConnection.del(key);
  await redisConnection.del(attemptsKey(phone, iin));
};
