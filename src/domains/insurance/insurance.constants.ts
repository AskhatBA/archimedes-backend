export const INSURANCE_API_GET_PROGRAMS = '/v3/client/programs';
export const INSURANCE_API_GET_PROGRAM_BY_ID = '/v3/client/programs/:programId';
export const INSURANCE_API_GET_USER_FAMILY = '/v3/client/family';
export const INSURANCE_API_GET_PROGRAM_CERTIFICATE = 'v3/certificate/:programId';
export const INSURANCE_API_GET_CITIES = '/v3/cities';
export const INSURANCE_API_GET_USER_PROFILE = '/v3/client/profile';
export const INSURANCE_API_SEND_OTP = '/v3/auth/sendOtp';
export const INSURANCE_API_VERIFY_OTP = '/v3/auth/verifyOtp';
export const INSURANCE_API_REFUND_REQUEST = '/v3/client/refundRequest';
export const INSURANCE_API_GET_REFUND_REQUESTS = '/v3/client/refundRequests';
export const INSURANCE_API_GET_MEDICAL_NETWORK = '/v3/medical_network/:programId';
export const INSURANCE_API_GET_PROGRAM_DESCRIPTION = '/v3/client/productdescription/:programId';
export const INSURANCE_API_GET_CONTACTS = '/v3/contacts';

export const insuranceApiResolverDefault = {
  [INSURANCE_API_GET_PROGRAMS]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_PROGRAM_BY_ID]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_USER_FAMILY]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_PROGRAM_CERTIFICATE]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_CITIES]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_USER_PROFILE]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_SEND_OTP]: {
    method: 'POST',
    defaultPayload: {},
  },
  [INSURANCE_API_VERIFY_OTP]: {
    method: 'POST',
    defaultPayload: {},
  },
  [INSURANCE_API_REFUND_REQUEST]: {
    method: 'POST',
    defaultPayload: {
      id: 0,
    },
  },
  [INSURANCE_API_GET_REFUND_REQUESTS]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_MEDICAL_NETWORK]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_PROGRAM_DESCRIPTION]: {
    method: 'GET',
    defaultPayload: {},
  },
  [INSURANCE_API_GET_CONTACTS]: {
    method: 'GET',
    defaultPayload: {},
  },
};
