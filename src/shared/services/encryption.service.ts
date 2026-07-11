import crypto from 'node:crypto';

import { config } from '@/config';

/**
 * Field-level encryption for PII stored in PostgreSQL.
 *
 * Uses AES-256-GCM (authenticated encryption). Stored values are
 * self-describing: `enc:v1:<base64(iv | authTag | ciphertext)>`.
 *
 * The `enc:v1:` prefix lets us:
 *  - detect already-encrypted values (idempotent re-encryption),
 *  - decrypt transparently regardless of which model a field came from
 *    (works for nested Prisma `include`s),
 *  - keep reading legacy plaintext rows during rollout (non-prefixed
 *    values are returned as-is).
 */

const VERSION = 'v1';
const PREFIX = `enc:${VERSION}:`;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

let cachedKey: Buffer | null = null;

const getKey = (): Buffer => {
  if (cachedKey) return cachedKey;

  const raw = config.encryption.key;
  if (!raw) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32',
    );
  }

  // Accept a 64-char hex key or a base64-encoded 32-byte key.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -hex 32`,
    );
  }

  cachedKey = key;
  return key;
};

export const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX);

export const encryptField = (plaintext: string): string => {
  // Already encrypted — do not double-encrypt.
  if (isEncrypted(plaintext)) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return PREFIX + payload.toString('base64');
};

export const decryptField = (value: string): string => {
  // Legacy plaintext (pre-encryption rows) — return unchanged.
  if (!isEncrypted(value)) return value;

  const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
};
