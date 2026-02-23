interface OneSignalPushNotificationMessage {
  en?: string;
  ru: string;
}

export interface OneSignalPushNotification {
  heading: OneSignalPushNotificationMessage;
  content: OneSignalPushNotificationMessage;
  playerIds: string[];
}
