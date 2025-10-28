import { Express } from 'express';

import authRoutes from '@/domains/auth/auth.routes';
import patientRoutes from '@/domains/patient/patient.routes';
import misRoutes from '@/domains/mis/mis.routes';
import insuranceRoutes from '@/domains/insurance/insurance.routes';

export const setupRoutes = (app: Express) => {
  app.use('/v1/api/auth', authRoutes);
  app.use('/v1/api/patient', patientRoutes);
  app.use('/v1/api/mis', misRoutes);
  app.use('/v1/api/insurance', insuranceRoutes);
};
