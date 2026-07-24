import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { initSentry } from '@/shared/lib/sentry';

import { config } from './config';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middlewares/error-handler.middleware';
import { requestContext, httpLogger } from './middlewares/request-logger.middleware';
import { setupRoutes } from './routes';

const app = express();

initSentry(app);

// Registered first so that every later middleware, route and service logs under the same reqId.
app.use(requestContext);
app.use(httpLogger);

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

setupRoutes(app);
setupSwagger(app);

app.use(errorHandler);

export default app;
