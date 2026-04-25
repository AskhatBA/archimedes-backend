import { Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';

import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';

import * as appVersionService from './app-version.service';
import type { AppVersionPlatformParam, AppVersionResponse } from './app-version.dto';

const SEMVER_REGEX = /^\d+\.\d+$/;

export const getVersion = async (req: Request, res: Response) => {
  await query('platform')
    .optional()
    .isIn(['ios', 'android'])
    .withMessage('platform must be "ios" or "android"')
    .run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const platform = req.query.platform as AppVersionPlatformParam | undefined;
  const record = await appVersionService.getLatestVersion(platform);

  const response: AppVersionResponse = {
    latestVersion: record.latestVersion,
    minSupportedVersion: record.minSupportedVersion,
    forceUpdate: record.forceUpdate,
    iosUrl: config.appVersion.iosUrl,
    androidUrl: config.appVersion.androidUrl,
    changelog: record.changelog,
  };

  return res.status(200).json({ success: true, ...response });
};

export const createVersion = async (req: Request, res: Response) => {
  console.log('createversion');
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  // if (req.user.role !== 'ADMIN') {
  //   throw new AppError('Forbidden', 403);
  // }

  await body('platform')
    .isIn(['ios', 'android', 'all'])
    .withMessage('platform must be "ios", "android", or "all"')
    .run(req);

  await body('latestVersion')
    .matches(SEMVER_REGEX)
    .withMessage('latestVersion must follow semantic versioning (x.y)')
    .run(req);

  await body('minSupportedVersion')
    .matches(SEMVER_REGEX)
    .withMessage('minSupportedVersion must follow semantic versioning (x.y)')
    .run(req);

  await body('forceUpdate').isBoolean().withMessage('forceUpdate must be a boolean').run(req);

  await body('changelog').optional().isString().withMessage('changelog must be a string').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const record = await appVersionService.createVersion(req.body);

  return res.status(201).json({ success: true, appVersion: record });
};
