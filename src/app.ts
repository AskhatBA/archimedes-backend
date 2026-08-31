import path from 'path';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { createLogger } from '@/shared/lib/logger';
import { initSentry } from '@/shared/lib/sentry';

import { registerPaymentSuccessHandlers } from './domains/payment/payment.success-handlers';

import { config } from './config';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middlewares/error-handler.middleware';
import { requestContext, httpLogger } from './middlewares/request-logger.middleware';
import { setupRoutes } from './routes';

const log = createLogger('cors');

// Before any route or background sweep can settle a payment.
registerPaymentSuccessHandlers();

const app = express();

// Native apps and server-to-server callers send no Origin at all - only browsers need the check.
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsOrigin.includes(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }

    log.warn({ origin, allowed: config.corsOrigin }, 'Blocked request from disallowed origin');

    return callback(null, false);
  },
  credentials: true,
};

initSentry(app);

// Registered first so that every later middleware, route and service logs under the same reqId.
app.use(requestContext);
app.use(httpLogger);

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Public documents (offer, policies). Resolved from the compiled file's own
// location, so it works both from src/ in dev and from dist/ in the image.
app.use(
  '/v1/api/static',
  express.static(path.resolve(__dirname, '../static'), {
    maxAge: '1h',
    // The app and the site fetch these from another origin - helmet's default
    // same-origin resource policy would block them.
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  }),
);

setupRoutes(app);
setupSwagger(app);

app.use(errorHandler);

export default app;
