import { AppVersionPlatform } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { AppError } from '@/shared/services/app-error.service';

import type { AppVersionPlatformParam, CreateAppVersionBody } from './app-version.dto';

const PLATFORM_MAP: Record<AppVersionPlatformParam, AppVersionPlatform> = {
  ios: AppVersionPlatform.IOS,
  android: AppVersionPlatform.ANDROID,
};

export const getLatestVersion = async (platform?: AppVersionPlatformParam) => {
  // Fetch the latest config for the requested platform and the ALL fallback in one query
  const platformFilter: AppVersionPlatform[] = platform
    ? [PLATFORM_MAP[platform], AppVersionPlatform.ALL]
    : [AppVersionPlatform.IOS, AppVersionPlatform.ANDROID, AppVersionPlatform.ALL];

  const rows = await prismaClient.appVersion.findMany({
    where: { platform: { in: platformFilter } },
    orderBy: { createdAt: 'desc' },
    take: platformFilter.length, // one per platform at most
  });

  if (rows.length === 0) {
    throw new AppError('No version configuration found', 404);
  }

  // Prefer exact platform match over ALL fallback
  const exact = platform ? rows.find((r) => r.platform === PLATFORM_MAP[platform]) : null;
  return exact ?? rows[0];
};

export const createVersion = (body: CreateAppVersionBody) => {
  const platform = body.platform.toUpperCase() as AppVersionPlatform;

  return prismaClient.appVersion.create({
    data: {
      platform,
      latestVersion: body.latestVersion,
      minSupportedVersion: body.minSupportedVersion,
      forceUpdate: body.forceUpdate,
      changelog: body.changelog ?? null,
    },
  });
};
