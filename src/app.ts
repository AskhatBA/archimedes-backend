import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import { config } from './config';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middlewares/error-handler.middleware';
import authRoutes from './domains/auth/auth.routes';
import patientRoutes from './domains/patient/patient.routes';
import misRoutes from './domains/mis/mis.routes';
import insuranceRoutes from './domains/insurance/insurance.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/v1/api/auth', authRoutes);
app.use('/v1/api/patient', patientRoutes);
app.use('/v1/api/mis', misRoutes);
app.use('/v1/api/insurance', insuranceRoutes);

setupSwagger(app);

app.use(errorHandler);

export default app;
