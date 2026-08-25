import { PaymentPurpose } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import * as patientService from '@/domains/patient/patient.service';
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

const validateMetadata = (metadata: unknown): AppointmentPaymentMetadata => {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new AppError('metadata is required for an appointment payment', 400);
  }

  const raw = metadata as Record<string, unknown>;

  return {
    doctorId: requireString(raw.doctorId, 'doctorId'),
    branchId: requireString(raw.branchId, 'branchId'),
    startTime: requireDate(raw.startTime, 'startTime'),
    endTime: requireDate(raw.endTime, 'endTime'),
    isTelemedicine: raw.isTelemedicine === true,
    ...(raw.familyMemberId
      ? { familyMemberId: requireString(raw.familyMemberId, 'familyMemberId') }
      : {}),
  };
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
  const patient = await patientService.getPatientById(context.userId);

  if (!patient?.misPatientId) {
    throw new AppError(`Patient not found for user ${context.userId}`, 404);
  }

  const appointment = await misService.createAppointment({
    userId: context.userId,
    patientId: patient.misPatientId,
    doctorId: metadata.doctorId,
    branchId: metadata.branchId,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    isTelemedicine: metadata.isTelemedicine,
    ...(metadata.familyMemberId ? { familyMemberId: metadata.familyMemberId } : {}),
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
    onSuccess: bookPaidAppointment,
  });
};
