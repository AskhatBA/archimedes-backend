import { Express } from 'express';

import authRoutes from '@/domains/auth/auth.routes';
import patientRoutes from '@/domains/patient/patient.routes';
import misRoutes from '@/domains/mis/mis.routes';
import insuranceRoutes from '@/domains/insurance/insurance.routes';
import meetingsRoutes from '@/domains/meetings/meetings.routes';

export const setupRoutes = (app: Express) => {
  app.use('/v1/api/auth', authRoutes);
  app.use('/v1/api/patient', patientRoutes);
  app.use('/v1/api/mis', misRoutes);
  app.use('/v1/api/insurance', insuranceRoutes);
  app.use('/v1/api/meetings', meetingsRoutes);
  app.get('/v1/api/debug-sentry', function mainHandler() {
    throw new Error('My first Sentry error!');
  });
};
