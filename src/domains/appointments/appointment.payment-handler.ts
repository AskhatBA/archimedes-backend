import { PaymentPurpose } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import * as patientService from '@/domains/patient/patient.service';
import { checkAppointmentConflicts } from '@/domains/appointments/appointments.service';
import {
  registerPaymentPurposeHandler,
  PaymentSuccessContext,
} from '@/domains/payment/payment.post-success.service';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';

const handlerLogger = createLogger('appointment-payment');

/**
 * Everything needed to book the appointment once the payment succeeds.
 *
 * Mirrors the body of `POST /mis/create-appointment`: a paid patient sends the same
 * fields, they are just held on the payment until it settles instead of being acted on
 * straight away.
 */
export interface AppointmentPaymentMetadata {
  doctorId: string;
  branchId: string;
  startTime: string;
  endTime: string;
  isTelemedicine: boolean;
  /** MIS id of a family member, when booking for someone other than the account owner. */
  familyMemberId?: string;
  /** `oid` of the doctor's service from `/insurance/medic-service`, sent to MIS as `booked_service`. */
  medicServiceOid?: string;
  /**
   * Display-only copies of what the patient picked. MIS knows none of this until the
   * appointment exists, so they are carried here to describe the visit while the payment
   * is still pending — see `GET /payment/pending`.
   */
  doctorName?: string;
  branchName?: string;
  branchAddress?: string;
  serviceName?: string;
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(`metadata.${field} is required`, 400);
  }
  return value;
};

const requireDate = (value: unknown, field: string): string => {
  const asString = requireString(value, field);
  if (Number.isNaN(new Date(asString).getTime())) {
    throw new AppError(`metadata.${field} must be a valid date`, 400);
  }
  return asString;
};

/** Display-only fields are dropped rather than rejected — they cannot break the booking. */
const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const validateMetadata = (metadata: unknown): AppointmentPaymentMetadata => {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new AppError('metadata is required for an appointment payment', 400);
  }

  const raw = metadata as Record<string, unknown>;

  const display = {
    doctorName: optionalString(raw.doctorName),
    branchName: optionalString(raw.branchName),
    branchAddress: optionalString(raw.branchAddress),
    serviceName: optionalString(raw.serviceName),
  };

  return {
    doctorId: requireString(raw.doctorId, 'doctorId'),
    branchId: requireString(raw.branchId, 'branchId'),
    startTime: requireDate(raw.startTime, 'startTime'),
    endTime: requireDate(raw.endTime, 'endTime'),
    isTelemedicine: raw.isTelemedicine === true,
    ...(raw.familyMemberId
      ? { familyMemberId: requireString(raw.familyMemberId, 'familyMemberId') }
      : {}),
    ...(raw.medicServiceOid
      ? { medicServiceOid: requireString(raw.medicServiceOid, 'medicServiceOid') }
      : {}),
    ...Object.fromEntries(Object.entries(display).filter(([, value]) => value !== undefined)),
  };
};

const requireMisPatientId = async (userId: string): Promise<string> => {
  const patient = await patientService.getPatientById(userId);

  if (!patient?.misPatientId) {
    throw new AppError(`Patient not found for user ${userId}`, 404);
  }

  return patient.misPatientId;
};

/**
 * Refuses the payment if this visit could not be booked.
 *
 * The same conflict rules `createAppointment` applies, run before the user pays: the
 * common case is a second booking with the same doctor on the same day, which used to be
 * discovered only after the money moved.
 */
const ensureBookable = async ({
  userId,
  metadata,
}: {
  userId: string;
  metadata: AppointmentPaymentMetadata;
}): Promise<void> => {
  const misPatientId = await requireMisPatientId(userId);

  await checkAppointmentConflicts(
    metadata.familyMemberId || misPatientId,
    metadata.doctorId,
    new Date(metadata.startTime)
  );
};

/**
 * Books the appointment a paid patient has just paid for.
 *
 * Runs on the payment settling successfully — from the FreedomPay result callback or
 * from the background reconciliation sweep, whichever gets there first — so the booking
 * happens even if the user closed the app on the provider's page.
 *
 * A patient without an insurance programme pays per visit, so no `insuranceProgramId` is
 * sent to MIS.
 */
const bookPaidAppointment = async (context: PaymentSuccessContext): Promise<void> => {
  const metadata = validateMetadata(context.metadata);
  const misPatientId = await requireMisPatientId(context.userId);

  const appointment = await misService.createAppointment({
    userId: context.userId,
    patientId: misPatientId,
    doctorId: metadata.doctorId,
    branchId: metadata.branchId,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    isTelemedicine: metadata.isTelemedicine,
    // Связь с платежом — это то, чем отмена отличает платный приём от приёма по программе,
    // и заодно источник суммы, от которой считается возврат.
    paymentId: context.paymentId,
    ...(metadata.familyMemberId ? { familyMemberId: metadata.familyMemberId } : {}),
    ...(metadata.medicServiceOid ? { medicServiceOid: metadata.medicServiceOid } : {}),
  });

  handlerLogger.info(
    {
      paymentId: context.paymentId,
      userId: context.userId,
      doctorId: metadata.doctorId,
      startTime: metadata.startTime,
      appointmentId: appointment?.id,
    },
    'Appointment booked after successful payment'
  );
};

export const registerAppointmentPaymentHandler = (): void => {
  registerPaymentPurposeHandler<AppointmentPaymentMetadata>(PaymentPurpose.APPOINTMENT, {
    validateMetadata,
    beforePayment: ensureBookable,
    onSuccess: bookPaidAppointment,
  });
};
