export const MIS_API_GET_USER_BY_PHONE = '/auth/beneficiary-login/';
export const MIS_API_GET_USER_PROFILE_BY_ID = '/auth/beneficiary/:userId/profile';
export const MIS_API_BRANCH_LIST = '/beneficiary/branches/';
export const MIS_API_CREATE_USER = '/auth/beneficiary-create/';
export const MIS_API_GET_SPECIALIZATION_BY_BRANCH_ID =
  '/beneficiary/branches/:branchId/specialties/';
export const MIS_API_GET_DOCTOR_LIST =
  '/beneficiary/branches/:branchId/specialties/:specializationId/doctors/';
export const MIS_API_GET_DOCTOR_BY_ID = '/beneficiary/doctors/:doctorId/';
export const MIS_API_GET_DOCTOR_AVAILABLE_SLOTS = '/beneficiary/doctors/:doctorId/available-slots/';
export const MIS_API_CREATE_APPOINTMENT = `/beneficiary/appointments/create/`;
export const MIS_API_GET_USER_APPOINTMENTS = '/beneficiary/:userId/appointments/';
export const MIS_API_REMOVE_USER_APPOINTMENT = '/beneficiary/:userId/appointments/:appointmentId';
export const MIS_API_GET_APPOINTMENT_HISTORY = '/beneficiary/:userId/appointment-history/';

export const misApiResolvers = {
  [MIS_API_GET_USER_BY_PHONE]: {
    method: 'POST',
    defaultPayload: {
      otp_verified: true,
    },
  },
  [MIS_API_GET_USER_PROFILE_BY_ID]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_BRANCH_LIST]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_CREATE_USER]: {
    method: 'POST',
    defaultPayload: {},
  },
  [MIS_API_GET_SPECIALIZATION_BY_BRANCH_ID]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_GET_DOCTOR_LIST]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_GET_DOCTOR_BY_ID]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_GET_DOCTOR_AVAILABLE_SLOTS]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_CREATE_APPOINTMENT]: {
    method: 'POST',
    defaultPayload: {
      record_type: 'paid',
      appointment_type: 'primary',
      notes: '',
    },
  },
  [MIS_API_GET_USER_APPOINTMENTS]: {
    method: 'GET',
    defaultPayload: {},
  },
  [MIS_API_REMOVE_USER_APPOINTMENT]: {
    method: 'DELETE',
    defaultPayload: {},
  },
  [MIS_API_GET_APPOINTMENT_HISTORY]: {
    method: 'GET',
    defaultPayload: {},
  },
};
