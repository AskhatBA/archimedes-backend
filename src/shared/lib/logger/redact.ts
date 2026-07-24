/**
 * Field names that must never reach the logs in clear text.
 *
 * Patient PII (IIN, phone) is encrypted at rest, so it must not leak through logs either;
 * the rest are credentials. Redaction happens inside the logger, which means it also covers
 * objects that were logged wholesale (an axios error, a MIS response) rather than relying on
 * every call site remembering to strip fields.
 */
const SENSITIVE_KEYS = [
  'iin',
  'phone',
  'phoneNumber',
  'otp',
  'otpHash',
  'pin',
  'pinHash',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'secret',
  'clientSecret',
  'client_secret',
  'apiKey',
  'authorization',
];

/**
 * fast-redact (used by pino) supports a single wildcard per path, so nesting is covered
 * explicitly for the first three levels — deep enough for `err.response.data.iin`.
 */
export const redactPaths = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_KEYS.map((key) => `req.query.${key}`),
  ...SENSITIVE_KEYS.map((key) => `req.params.${key}`),
  ...SENSITIVE_KEYS.map((key) => `payload.*.${key}`),
  ...SENSITIVE_KEYS.map((key) => `responseData.*.${key}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const REDACTION_CENSOR = '[Redacted]';
