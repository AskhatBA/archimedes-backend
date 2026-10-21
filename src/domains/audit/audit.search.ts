export type AuthAttemptSearch = { phone: string } | { iin: string };

/**
 * Reads what the admin typed as a full phone (`+7 (777) 123-45-67`, `87771234567`,
 * `7771234567`) or a 12-digit IIN. Partial numbers are refused rather than matched with
 * `LIKE`: the lookup is meant to find one person, and an exact match is what is indexed.
 */
export const parseAuthAttemptSearch = (search: string): AuthAttemptSearch | null => {
  const digits = search.replace(/\D/g, '');

  if (digits.length === 12) return { iin: digits };
  if (digits.length === 10) return { phone: `7${digits}` };
  if (digits.length === 11 && /^[78]/.test(digits)) return { phone: `7${digits.slice(1)}` };

  return null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER_LIKE_REGEX = /^[\d\s+()-]+$/;

/**
 * What the admin typed into the log search: a person (a full phone or IIN — logs never
 * hold either, so it is resolved to their account and their sign-in attempts), a request
 * or user id pasted in whole, or a piece of text matched against URLs and messages.
 */
export type LogSearch = { person: AuthAttemptSearch } | { id: string } | { text: string };

export const parseLogSearch = (input: string): LogSearch => {
  const trimmed = input.trim();

  if (UUID_REGEX.test(trimmed)) return { id: trimmed.toLowerCase() };

  const person = NUMBER_LIKE_REGEX.test(trimmed) ? parseAuthAttemptSearch(trimmed) : null;

  return person ? { person } : { text: trimmed };
};
