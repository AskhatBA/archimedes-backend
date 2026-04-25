export type AppVersionPlatformParam = 'ios' | 'android';

export interface GetAppVersionQuery {
  platform?: AppVersionPlatformParam;
}

export interface AppVersionResponse {
  latestVersion: string;
  minSupportedVersion: string;
  forceUpdate: boolean;
  iosUrl: string;
  androidUrl: string;
  changelog: string | null;
}

export interface CreateAppVersionBody {
  platform: 'ios' | 'android' | 'all';
  latestVersion: string;
  minSupportedVersion: string;
  forceUpdate: boolean;
  changelog?: string;
}
