import app from './app';
import { config } from './config';
import { startNotificationWorker } from './shared/queues/notification.worker';

// Start the notification worker
startNotificationWorker();

app.listen(+config.port, '0.0.0.0', () => {
  console.log(`Server is running on port ${config.port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  const { stopNotificationWorker } = await import('./shared/queues/notification.worker');
  await stopNotificationWorker();
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  const { stopNotificationWorker } = await import('./shared/queues/notification.worker');
  await stopNotificationWorker();
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
});
