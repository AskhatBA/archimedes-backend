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

/**
 * Splits a comma-separated address list ("a@x.kz, b@y.kz") into recipients.
 * Undefined when unset/blank, so the caller's default stands.
 */
function parseEmailList(value?: string): string[] | undefined {
  const emails = (value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  return emails.length > 0 ? emails : undefined;
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

  // The single dashboard operator. email/password/phone are read only by the
  // provisioning script (`npm run db:create-admin`) — the running server never
  // compares against them, it compares against the stored bcrypt hash.
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    phone: process.env.ADMIN_PHONE,
    maxLoginAttempts: Number(process.env.ADMIN_MAX_LOGIN_ATTEMPTS) || 5,
    lockMinutes: Number(process.env.ADMIN_LOCK_MINUTES) || 15,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER!,
  },

  mis: {
    apiUrl: `${process.env.MIS_API_URL}${process.env.MIS_API_PREFIX}`,
    devApiUrl: `${process.env.MIS_DEV_API_URL}${process.env.MIS_API_PREFIX}`,

    // Статусы приёмов живут в МИС, колбэков оттуда нет — локальные строки подтягивает
    // фоновая синхронизация.
    appointmentSync: {
      // Отключается без выкатки кода: например, пока МИС на обслуживании.
      enabled: process.env.MIS_APPOINTMENT_SYNC_ENABLED !== 'false',
      // Как часто запускается проход. Приём меняет статус редко, поэтому минуты, не секунды.
      intervalSeconds: Number(process.env.MIS_APPOINTMENT_SYNC_INTERVAL_SECONDS) || 900,
      // Сколько пациентов МИС опрашивается за один проход: запросы идут по пациенту,
      // а не по приёму, поэтому это верхняя граница нагрузки на МИС.
      // Держите batchSize * spacing меньше intervalSeconds, иначе проходы наложатся.
      batchSize: Number(process.env.MIS_APPOINTMENT_SYNC_BATCH_SIZE) || 25,
      // Пауза между запросами к МИС, чтобы проход не выглядел как всплеск трафика.
      requestSpacingMs: Number(process.env.MIS_APPOINTMENT_SYNC_SPACING_MS) || 300,
      // Насколько глубоко в прошлое смотреть: приём, который МИС так и не закрыл за это
      // время, перестаёт опрашиваться, иначе выборка растёт бесконечно.
      lookbackDays: Number(process.env.MIS_APPOINTMENT_SYNC_LOOKBACK_DAYS) || 7,
      // Горизонт «горячих» приёмов: до него визит сверяется каждый проход. Нижняя граница
      // задана напоминаниями — они уходят за 3 часа до приёма, и отмена должна быть
      // известна раньше, чем уйдёт пуш.
      hotHorizonHours: Number(process.env.MIS_APPOINTMENT_SYNC_HOT_HORIZON_HOURS) || 48,
      // Всё, что дальше горизонта, сверяется не чаще этого: запись на месяц вперёд не
      // должна занимать место в очереди наравне с завтрашним визитом.
      coldIntervalHours: Number(process.env.MIS_APPOINTMENT_SYNC_COLD_INTERVAL_HOURS) || 24,
    },
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

  mail: {
    // Отключает отправку писем целиком, не трогая код: например, на стенде.
    enabled: process.env.MAIL_ENABLED !== 'false',
    smtp: {
      host: process.env.SMTP_HOST || 'mail.archimedes.kz',
      port: Number(process.env.SMTP_PORT) || 25,
      // 25 — это открытый порт с STARTTLS, а не SMTPS. secure=true только для 465.
      secure: process.env.SMTP_SECURE === 'true',
      // Релей внутренний и может ходить без авторизации — тогда логин/пароль пустые.
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      // У внутреннего релея обычно самоподписанный сертификат, и на 25-м порту
      // письмо всё равно уходит открыто, поэтому по умолчанию не проверяем.
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true',
    },
    // Адрес в поле From. Домен должен совпадать с релеем, иначе письмо уйдёт в спам.
    from: process.env.MAIL_FROM || 'Archimedes App <no-reply@archimedes.kz>',
    // Кому уходят заявки на платные программы. Список через запятую —
    // адрес меняется или дополняется через PROGRAM_ORDER_EMAIL_TO без правки кода.
    programOrderRecipients: parseEmailList(process.env.PROGRAM_ORDER_EMAIL_TO) ?? [
      'baltabaev.a2509@gmail.com',
    ],
  },

  medAccount: {
    // Зачисление на медсчёт идёт в систему страховой (`/v3/topupBalance`) сразу после
    // успешной оплаты. Выключатель на случай, если страховая ляжет: с `false`
    // оплаченное пополнение остаётся PENDING и его проводит оператор из дашборда.
    creditEnabled: process.env.MED_ACCOUNT_CREDIT_ENABLED !== 'false',
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
