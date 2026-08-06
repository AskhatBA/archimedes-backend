import * as process from 'node:process';

import dotenv from 'dotenv';

const DEFAULT_PORT = 4000;
const DEFAULT_NODE_ENV = 'development';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || DEFAULT_NODE_ENV;

export const config = {
  port: process.env.PORT || DEFAULT_PORT,
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

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
    merchantId: Number(process.env.FREEDOMPAY_MERCHANT_ID) || 587251,
    secretKey: process.env.FREEDOMPAY_SECRET_KEY || 'n3EdQzxXq4M0Qcvr',
    apiUrl: process.env.FREEDOMPAY_API_URL || 'https://api.freedompay.kz',
    callbackUrl: process.env.FREEDOMPAY_CALLBACK_URL || '',
    successUrl: process.env.FREEDOMPAY_SUCCESS_URL || '',
    failureUrl: process.env.FREEDOMPAY_FAILURE_URL || '',
  },
};

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
