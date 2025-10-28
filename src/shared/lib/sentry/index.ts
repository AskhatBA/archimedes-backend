import Sentry from '@sentry/node';
import type { Express } from 'express';

import { config } from '@/config';

export const initSentry = (app: Express) => {
  Sentry.init({
    dsn: config.sentry.dsn as string,
    sendDefaultPii: true,
    environment: config.nodeEnv || 'production',
    tracesSampleRate: 1.0,
  });

  Sentry.setupExpressErrorHandler(app);
};
