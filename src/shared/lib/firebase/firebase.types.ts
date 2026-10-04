export interface FcmPushNotification {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown> | undefined;
}
