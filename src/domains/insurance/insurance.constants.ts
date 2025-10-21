export const INSURANCE_API_GET_PROGRAMS = '/v3/client/programs';
export const INSURANCE_API_GET_PROGRAM_BY_ID = '/v3/client/programs/:programId';
export const INSURANCE_API_GET_USER_FAMILY = '/v3/client/family';
export const INSURANCE_API_GET_PROGRAM_CERTIFICATE = 'v3/certificate/:programId';

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
};
