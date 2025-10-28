import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import { initSentry } from '@/shared/lib/sentry';

import { config } from './config';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middlewares/error-handler.middleware';
import { setupRoutes } from './routes';

const app = express();

initSentry(app);

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

setupRoutes(app);
setupSwagger(app);

app.use(errorHandler);

export default app;
