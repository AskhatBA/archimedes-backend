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
  'passwordHash',
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
  // Webkassa пишет поля в PascalCase, а имя заголовка ключа — через дефис.
  'Token',
  'Password',
  'Login',
  'x-api-key',
  'CustomerPhone',
  'CustomerEmail',
  'CustomerXin',
  'customerPhone',
  'customerEmail',
  'customerXin',
];

/** `x-api-key` и подобные имена в путях redact пишутся только в скобочной нотации. */
const isPlainIdentifier = (key: string): boolean => /^[A-Za-z_$][\w$]*$/.test(key);

const child = (prefix: string, key: string): string =>
  isPlainIdentifier(key) ? `${prefix}.${key}` : `${prefix}["${key}"]`;

const topLevel = (key: string): string => (isPlainIdentifier(key) ? key : `["${key}"]`);

/**
 * fast-redact (used by pino) supports a single wildcard per path, so nesting is covered
 * explicitly for the first three levels — deep enough for `err.response.data.iin`.
 */
export const redactPaths = [
  ...SENSITIVE_KEYS.map(topLevel),
  ...SENSITIVE_KEYS.map((key) => child('*', key)),
  ...SENSITIVE_KEYS.map((key) => child('req.query', key)),
  ...SENSITIVE_KEYS.map((key) => child('req.params', key)),
  ...SENSITIVE_KEYS.map((key) => child('payload.*', key)),
  ...SENSITIVE_KEYS.map((key) => child('responseData.*', key)),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const REDACTION_CENSOR = '[Redacted]';
