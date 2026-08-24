import { Request, Response } from 'express';

import * as statsService from './stats.service';

/**
 * Admin-only: the route is behind `requireRole(Role.ADMIN)`, so a mobile token gets a
 * 403 here and never sees platform-wide figures.
 */
export const getOverview = async (_req: Request, res: Response) => {
  const stats = await statsService.getOverviewStats();

  return res.status(200).json({ success: true, ...stats });
};
