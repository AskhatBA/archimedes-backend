import { Router } from 'express';

import * as controller from './auth.controller';

const router = Router();

router.post('/request-otp', controller.requestOtp);
router.post('/login-otp', controller.loginWithOtp);

export default router;
