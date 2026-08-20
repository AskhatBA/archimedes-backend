import * as process from 'node:process';

import dotenv from 'dotenv';

const DEFAULT_PORT = 4000;
const DEFAULT_NODE_ENV = 'development';

dotenv.config();

const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

const nodeEnv = process.env.NODE_ENV || DEFAULT_NODE_ENV;

/** Splits CORS_ORIGIN ("https://a.kz, https://b.kz") into an allowlist. Undefined when unset/blank. */
function parseOriginList(value?: string): string[] | undefined {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return origins.length > 0 ? origins : undefined;
}

export const config = {
  port: process.env.PORT || DEFAULT_PORT,
  nodeEnv,
  // Comma-separated allowlist: the browser is sent back the caller's own origin when it matches.
  corsOrigin: parseOriginList(process.env.CORS_ORIGIN) ?? DEFAULT_CORS_ORIGINS,

  logging: {
    level: process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
    // Human-readable output via pino-pretty. JSON to stdout everywhere else.
    pretty: process.env.LOG_PRETTY ? process.env.LOG_PRETTY === 'true' : nodeEnv !== 'production',
  },

  token: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  },

  pin: {
    maxAttempts: Number(process.env.PIN_MAX_ATTEMPTS) || 5,
    lockMinutes: Number(process.env.PIN_LOCK_MINUTES) || 15,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  },

  mis: {
    apiUrl: `${process.env.MIS_API_URL}${process.env.MIS_API_PREFIX}`,
    devApiUrl: `${process.env.MIS_DEV_API_URL}${process.env.MIS_API_PREFIX}`,
  },

  smsService: {
    apiUrl: process.env.SMS_SERVICE_API_URL,
    username: process.env.SMS_SERVICE_USERNAME,
    password: process.env.SMS_SERVICE_PASSWORD,
    originator: process.env.SMS_SERVICE_ORIGINATOR,
  },

  insuranceService: {
    apiUrl: process.env.INSURANCE_SERVICE_API_URL!,
    apiDevUrl: process.env.INSURANCE_SERVICE_DEV_API_URL!,
    testId: process.env.INSURANCE_TEST_ID,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  encryption: {
    key: process.env.FIELD_ENCRYPTION_KEY,
  },

  redis: {
    host: process.env.REDIS_HOST,
  },

  demoAccount: {
    phone: process.env.DEMO_ACCOUNT_PHONE,
    iin: process.env.DEMO_ACCOUNT_IIN,
    otp: process.env.DEMO_ACCOUNT_OTP,
    misIin: process.env.DEMO_MIS_ACCOUNT_IIN,
    misPhone: process.env.DEMO_MIS_ACCOUNT_PHONE,
  },

  zoom: {
    accountId: process.env.ZOOM_ACCOUNT_ID,
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
    tokenUrl: process.env.ZOOM_TOKEN_URL || 'https://zoom.us/oauth/token',
    apiUrl: process.env.ZOOM_API_URL || 'https://api.zoom.us/v2',
  },

  oneSignal: {
    appId: process.env.ONE_SIGNAL_APP_ID,
    apiAuthKey: process.env.ONE_SIGNAL_API_AUTH_KEY,
  },

  notifications: {
    // Fire appointment reminders seconds after creation instead of hours before the visit
    testMode: process.env.NOTIFICATION_TEST_MODE === 'true',
  },

  appVersion: {
    iosUrl: process.env.APP_VERSION_IOS_URL || '',
    androidUrl: process.env.APP_VERSION_ANDROID_URL || '',
  },

  freedomPay: {
    merchantId: Number(process.env.FREEDOMPAY_MERCHANT_ID) || 0,
    secretKey: process.env.FREEDOMPAY_SECRET_KEY || '',
    apiUrl: process.env.FREEDOMPAY_API_URL || 'https://api.freedompay.kz',
    callbackUrl: process.env.FREEDOMPAY_CALLBACK_URL || '',
    successUrl: process.env.FREEDOMPAY_SUCCESS_URL || '',
    failureUrl: process.env.FREEDOMPAY_FAILURE_URL || '',
    // pg_testing_mode: payments are created on the sandbox, no real money moves.
    testingMode: process.env.FREEDOMPAY_TESTING_MODE === 'true',
    // pg_lifetime: seconds the payer has to complete the payment before it expires.
    lifetimeSeconds: Number(process.env.FREEDOMPAY_LIFETIME_SECONDS) || 1800,

    reconcile: {
      // How often the background job re-checks PENDING payments against FreedomPay.
      intervalSeconds: Number(process.env.FREEDOMPAY_RECONCILE_INTERVAL_SECONDS) || 60,
      // Upper bound on payments inspected per run, so one sweep cannot run unbounded.
      // Keep batchSize * spacing below intervalSeconds or sweeps start overlapping.
      batchSize: Number(process.env.FREEDOMPAY_RECONCILE_BATCH_SIZE) || 20,
      // FreedomPay asks for 1.5-2s between consecutive payment API calls to avoid
      // tripping its rate limiting and anti-fraud checks.
      requestSpacingMs: Number(process.env.FREEDOMPAY_RECONCILE_SPACING_MS) || 1500,
      // A payment still PENDING this long after creation is treated as abandoned and
      // marked FAILED. Must exceed pg_lifetime, otherwise a payer who is still on the
      // provider's page gets their order failed underneath them.
      maxAgeMinutes: Number(process.env.FREEDOMPAY_RECONCILE_MAX_AGE_MINUTES) || 60,
    },
  },
};

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
