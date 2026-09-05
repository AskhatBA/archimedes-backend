import Sentry from '@sentry/node';

import app from './app';
import { config } from './config';
import { logger } from './shared/lib/logger';
import { startNotificationWorker } from './shared/queues/notification.worker';
import {
  scheduleAppointmentSync,
  unscheduleAppointmentSync,
} from './shared/queues/appointment-sync.queue';
import { startAppointmentSyncWorker } from './shared/queues/appointment-sync.worker';
import { schedulePaymentReconciliation } from './shared/queues/payment-reconciliation.queue';
import { startPaymentReconciliationWorker } from './shared/queues/payment-reconciliation.worker';
import { startProgramOrderEmailWorker } from './shared/queues/program-order-email.worker';
import { startMedAccountCreditWorker } from './shared/queues/med-account-credit.worker';

// Start the notification worker
startNotificationWorker();

// Письма о новых оплаченных заявках на платные программы.
startProgramOrderEmailWorker();

// Зачисление оплаченных пополнений медсчёта на стороне страховой
startMedAccountCreditWorker();

// Settles payments whose FreedomPay result callback never arrived. Runs in the background
// so no client has to poll for an outcome.
startPaymentReconciliationWorker();
void schedulePaymentReconciliation().catch((err) => {
  logger.error({ err }, 'Failed to schedule payment reconciliation');
});

// Статусы приёмов принадлежат МИС и меняются там без уведомлений, поэтому наши строки
// сверяются с МИС по расписанию.
if (config.mis.appointmentSync.enabled) {
  startAppointmentSyncWorker();
  void scheduleAppointmentSync().catch((err) => {
    logger.error({ err }, 'Failed to schedule appointment status sync');
  });
} else {
  // Иначе расписание, поставленное предыдущим запуском, продолжило бы будить воркер.
  void unscheduleAppointmentSync().catch((err) => {
    logger.error({ err }, 'Failed to unschedule appointment status sync');
  });
}

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

  const { stopPaymentReconciliationWorker } = await import(
    './shared/queues/payment-reconciliation.worker'
  );
  await stopPaymentReconciliationWorker();

  const { stopProgramOrderEmailWorker } = await import(
    './shared/queues/program-order-email.worker'
  );
  await stopProgramOrderEmailWorker();

  const { stopMedAccountCreditWorker } = await import(
    './shared/queues/med-account-credit.worker'
  );
  await stopMedAccountCreditWorker();

  if (config.mis.appointmentSync.enabled) {
    const { stopAppointmentSyncWorker } = await import('./shared/queues/appointment-sync.worker');
    await stopAppointmentSyncWorker();
  }

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
