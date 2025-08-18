import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './user.controller';

const router = Router();

router.get('/patient/profile', authenticate, controller.getUserProfile);

export default router;
