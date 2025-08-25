import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './patient.controller';

const router = Router();

router.get('/profile', authenticate, controller.getPatientProfile);

router.post('/profile', authenticate, controller.createPatientProfile);

export default router;
