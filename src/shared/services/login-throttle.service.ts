import { redisConnection } from '@/infrastructure/redis';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';

const log = createLogger('login-throttle');

const KEY_PREFIX = 'admin-login-failures:';

const keyFor = (email: string) => `${KEY_PREFIX}${email}`;

/**
 * Failed dashboard logins are counted per email in Redis and reset on success.
 *
 * Keyed on the email rather than the IP so an attacker cannot start over by
 * rotating addresses. The trade-off is that someone who knows the admin email
 * can keep the account locked; with a lock measured in minutes (not a permanent
 * disable) that is the lesser of the two risks, and it mirrors how the mobile
 * PIN lock already behaves.
 */
export const assertNotThrottled = async (email: string): Promise<void> => {
  const failures = Number(await redisConnection.get(keyFor(email))) || 0;

  if (failures >= config.admin.maxLoginAttempts) {
    throw new AppError(ErrorCodes.TOO_MANY_LOGIN_ATTEMPTS, 429);
  }
};

/** Returns the new failure count. The window restarts on the first failure only. */
export const registerFailure = async (email: string): Promise<number> => {
  const key = keyFor(email);

  try {
    const failures = await redisConnection.incr(key);

    if (failures === 1) {
      await redisConnection.expire(key, config.admin.lockMinutes * 60);
    }

    return failures;
  } catch (err) {
    // Redis being down must not turn into a 500 that hides a wrong password —
    // the caller still rejects the login, it just is not counted.
    log.error({ err, email }, 'Failed to record login failure');

    return 0;
  }
};

export const clearFailures = async (email: string): Promise<void> => {
  await redisConnection.del(keyFor(email)).catch((err) => {
    log.error({ err, email }, 'Failed to clear login failures');
  });
};
