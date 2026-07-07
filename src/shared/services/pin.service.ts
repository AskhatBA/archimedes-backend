import bcrypt from 'bcryptjs';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

const PIN_REGEX = /^\d{4,6}$/;

/**
 * Rejects PINs that are trivially guessable: all-identical digits (1111) and
 * strictly ascending/descending runs (1234, 6543).
 */
const isWeakPin = (pin: string): boolean => {
  if (new Set(pin).size === 1) {
    return true;
  }

  const isSequential = (step: number) =>
    pin.split('').every((digit, i) => i === 0 || Number(digit) - Number(pin[i - 1]) === step);

  return isSequential(1) || isSequential(-1);
};

export const assertValidPinFormat = (pin: unknown): void => {
  if (typeof pin !== 'string' || !PIN_REGEX.test(pin) || isWeakPin(pin)) {
    throw new AppError(ErrorCodes.INVALID_PIN_FORMAT, 400);
  }
};

export const hashPin = (pin: string): Promise<string> => {
  return bcrypt.hash(pin, 10);
};

export const verifyPin = (pin: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(pin, hash);
};
