import Sentry from '@sentry/node';

import app from './app';
import { config } from './config';
import { logger } from './shared/lib/logger';
import { startNotificationWorker } from './shared/queues/notification.worker';

// Start the notification worker
startNotificationWorker();

// app.listen(config.port, () => {
//   console.log(`Server is running on port ${config.port}`);
// });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Server started');
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully');

  const { stopNotificationWorker } = await import('./shared/queues/notification.worker');
  await stopNotificationWorker();

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await Sentry.flush(2000);
  // Flush buffered log lines before the process disappears.
  logger.flush();

  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
};

// Graceful shutdown
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Without these, a crash outside the request cycle leaves no trace at all.
process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  logger.fatal({ err }, 'Uncaught exception');

  void Sentry.flush(2000).then(() => {
    logger.flush();
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
