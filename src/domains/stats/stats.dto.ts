export type OverviewStatsResponse = {
  /** Patient profiles in our DB — one per mobile user that finished onboarding. */
  totalPatients: number;
  /** Every refund claim ever submitted from the app. */
  totalRefundRequests: number;
  /** Refund claims the insurer accepted (`errorCode = 0` in its response). */
  acceptedRefunds: number;
  totalAppointments: number;
  appointmentsToday: number;
};
