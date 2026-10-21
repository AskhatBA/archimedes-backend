import { Request, Response } from 'express';
import { query, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as auditLogsService from './audit.logs.service';
import { parseAuthAttemptSearch, parseLogSearch } from './audit.search';
import * as auditService from './audit.service';

const AUTH_ATTEMPT_MAX_LIMIT = 100;
const APP_LOG_MAX_LIMIT = 200;

/**
 * Sign-in and registration attempts for the dashboard, searchable by phone or IIN.
 * Admin-only — the route is behind `requireRole(Role.ADMIN)`. Looking someone up is
 * itself written to the audit trail, since it shows who tried to get in and from where.
 */
export const getAuthAttempts = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').run(req);
  await query('limit')
    .optional()
    .isInt({ min: 1, max: AUTH_ATTEMPT_MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${AUTH_ATTEMPT_MAX_LIMIT}`)
    .run(req);
  await query('success')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('success must be true or false')
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { page, limit, success } = req.query;
  const rawSearch = (req.query.search as string | undefined)?.trim();
  const search = rawSearch ? parseAuthAttemptSearch(rawSearch) : null;

  if (rawSearch && !search) {
    throw new AppError(ErrorCodes.INVALID_AUTH_ATTEMPT_SEARCH, 400);
  }

  const result = await auditService.getAuthAttempts({
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    search,
    success: success === undefined ? undefined : success === 'true',
  });

  auditLogService.log({
    event: AuditEvent.AUTH_ATTEMPTS_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: {
      source: 'admin',
      searchedBy: search ? ('iin' in search ? 'iin' : 'phone') : null,
      page: result.page,
      total: result.total,
    },
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
};

/**
 * Backend log lines for the dashboard, newest first, paged by an `id` cursor. `search`
 * takes a phone or IIN (resolved to that person's requests), a request or user id, or
 * text matched against URLs and messages; `reqId` returns one request's lines in order.
 * Admin-only, and each read is audited — the lines show what a patient did and when.
 */
export const getAppLogs = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('limit')
    .optional()
    .isInt({ min: 1, max: APP_LOG_MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${APP_LOG_MAX_LIMIT}`)
    .run(req);
  await query('before').optional().isInt({ min: 1 }).withMessage('before must be a log id').run(req);
  await query('level').optional().isIn(['warn', 'error']).withMessage('level must be warn or error').run(req);
  await query('from').optional().isISO8601().withMessage('from must be an ISO date').run(req);
  await query('to').optional().isISO8601().withMessage('to must be an ISO date').run(req);
  await query('reqId').optional().isString().isLength({ min: 1, max: 100 }).run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { limit, before, level, from, to, reqId } = req.query;
  const rawSearch = (req.query.search as string | undefined)?.trim();
  const search = rawSearch ? parseLogSearch(rawSearch) : null;

  const result = await auditLogsService.getAppLogs({
    search,
    reqId: (reqId as string) || undefined,
    level: (level as auditLogsService.LogLevelFilter) || undefined,
    from: from ? new Date(from as string) : undefined,
    to: to ? new Date(to as string) : undefined,
    before: before ? BigInt(before as string) : undefined,
    limit: limit ? Number(limit) : 100,
  });

  auditLogService.log({
    event: AuditEvent.APP_LOGS_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: {
      source: 'admin',
      searchedBy: search ? Object.keys(search)[0] : null,
      reqId: (reqId as string) || null,
      count: result.items.length,
    },
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
};
