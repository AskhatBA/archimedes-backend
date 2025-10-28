import { Request, Response } from 'express';

export const getUserProfile = (_: Request, res: Response) => {
  return res.status(200).json({
    success: true,
  });
};
