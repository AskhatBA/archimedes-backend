-- Push notifications moved from OneSignal to Firebase Cloud Messaging.

-- RenameColumn: the columns now hold the FCM message id and a summary of the FCM response.
ALTER TABLE "Notification" RENAME COLUMN "oneSignalId" TO "pushMessageId";
ALTER TABLE "Notification" RENAME COLUMN "oneSignalResponse" TO "pushResponse";

-- OneSignal subscription ids are UUIDs, which FCM tokens never are. FCM rejects them as
-- malformed rather than unregistered, so the send path would never clean them up itself;
-- an updated app registers its FCM token again on launch.
DELETE FROM "DeviceToken"
WHERE "deviceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
