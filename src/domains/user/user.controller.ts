import { Request, Response } from 'express';
import { query, validationResult } from 'express-validator';

import * as userService from './user.service';

export const getUserProfile = (_: Request, res: Response) => {
  return res.status(200).json({
    success: true,
  });
};

export const checkAccount = async (req: Request, res: Response) => {
  await query('iin')
    .notEmpty()
    .isLength({ min: 12, max: 12 })
    .withMessage('IIN must be 12 characters')
    .run(req);
  await query('phone').optional().isString().run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const iin = req.query.iin as string;
  const phone = req.query.phone as string | undefined;

  const result = await userService.checkAccount(iin, phone);

  return res.status(200).json({ success: true, ...result });
};
