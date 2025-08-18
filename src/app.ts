import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import { config } from './config';
import { errorHandler } from './middlewares/error-handler.middleware';
import authRoutes from './domains/auth/auth.routes';
import userRoutes from './domains/user/user.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/v1/api/auth', authRoutes);
app.use('/v1/api/user', userRoutes);

app.use(errorHandler);

export default app;
