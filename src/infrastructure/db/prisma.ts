import { PrismaClient } from '@prisma/client';

import {
  decryptField,
  encryptField,
  isEncrypted,
} from '@/shared/services/encryption.service';

/** Models and fields whose values are encrypted at rest. */
const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  Patient: ['firstName', 'lastName', 'patronymic', 'fullName'],
  Doctor: ['firstName', 'lastName', 'patronymic', 'fullName'],
};

const ALL_ENCRYPTED_FIELD_NAMES = new Set(
  Object.values(ENCRYPTED_FIELDS).flat(),
);

/** Encrypt the configured fields inside a create/update `data` payload. */
const encryptData = (model: string | undefined, data: unknown): unknown => {
  const fields = model ? ENCRYPTED_FIELDS[model] : undefined;
  if (!fields || data === null || typeof data !== 'object') return data;

  const encryptOne = (record: Record<string, unknown>) => {
    for (const field of fields) {
      const value = record[field];
      if (typeof value === 'string') {
        record[field] = encryptField(value);
      } else if (value !== null && typeof value === 'object') {
        // Handles update operators like { set: '...' }.
        const nested = value as Record<string, unknown>;
        if (typeof nested.set === 'string') {
          nested.set = encryptField(nested.set);
        }
      }
    }
    return record;
  };

  if (Array.isArray(data)) {
    return data.map((item) => encryptOne(item as Record<string, unknown>));
  }
  return encryptOne(data as Record<string, unknown>);
};

/**
 * Recursively decrypt any encrypted field found in a query result. Driven by
 * the `enc:v1:` prefix + field name, so nested `include`d relations
 * (e.g. user.patient, appointment.doctor) are decrypted transparently.
 */
const decryptResult = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(decryptResult);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (
      ALL_ENCRYPTED_FIELD_NAMES.has(key) &&
      typeof child === 'string' &&
      isEncrypted(child)
    ) {
      record[key] = decryptField(child);
    } else if (child !== null && typeof child === 'object') {
      decryptResult(child);
    }
  }
  return record;
};

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);

const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Encrypt PII on the way in.
        if (WRITE_OPERATIONS.has(operation) && args && typeof args === 'object') {
          const a = args as Record<string, unknown>;
          if ('data' in a) a.data = encryptData(model, a.data);
          if ('create' in a) a.create = encryptData(model, a.create);
          if ('update' in a) a.update = encryptData(model, a.update);
        }

        const result = await query(args);

        // Decrypt PII on the way out (covers nested includes/selects).
        return decryptResult(result);
      },
    },
  },
});

export default prisma;
