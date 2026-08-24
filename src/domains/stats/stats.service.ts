import { prismaClient } from '@/infrastructure/db';

import type { OverviewStatsResponse } from './stats.dto';

/** Local-midnight bounds of the current day — appointments are stored as absolute timestamps. */
const todayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

/**
 * A refund counts as accepted when the insurer's stored answer says it registered the
 * claim. Two shapes appear in `externalResponse`: the documented `errorCode` (0 = ok)
 * and, on a successful submission, a bare claim number under `code`. Anything else —
 * a non-zero `errorCode`, or no response at all — never landed there.
 */
const countAcceptedRefunds = async () => {
  const [row] = await prismaClient.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM "InsuranceRefundRequest"
    WHERE "externalResponse" ->> 'errorCode' = '0'
       OR "externalResponse" ->> 'code' IS NOT NULL
  `;

  return row?.count ?? 0;
};

/**
 * Counters behind the dashboard "Обзор" screen. Every figure is a `count`, so this stays
 * a handful of index-backed queries fired in parallel rather than loading any rows.
 */
export const getOverviewStats = async (): Promise<OverviewStatsResponse> => {
  const { start, end } = todayRange();

  const [totalPatients, totalRefundRequests, acceptedRefunds, totalAppointments, appointmentsToday] =
    await Promise.all([
      prismaClient.patient.count(),
      prismaClient.insuranceRefundRequest.count(),
      countAcceptedRefunds(),
      prismaClient.appointment.count(),
      prismaClient.appointment.count({ where: { dateTime: { gte: start, lt: end } } }),
    ]);

  return {
    totalPatients,
    totalRefundRequests,
    acceptedRefunds,
    totalAppointments,
    appointmentsToday,
  };
};
