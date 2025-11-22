import * as process from 'node:process';

import dotenv from 'dotenv';

const DEFAULT_PORT = 5050;
const DEFAULT_NODE_ENV = 'development';

dotenv.config();

export const config = {
  port: process.env.PORT || DEFAULT_PORT,
  nodeEnv: process.env.NODE_ENV || DEFAULT_NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  token: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
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

  demoAccount: {
    phone: process.env.DEMO_ACCOUNT_PHONE,
    iin: process.env.DEMO_ACCOUNT_IIN,
    otp: process.env.DEMO_ACCOUNT_OTP,
    misIin: process.env.DEMO_MIS_ACCOUNT_IIN,
    misPhone: process.env.DEMO_MIS_ACCOUNT_PHONE,
  },
};

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
