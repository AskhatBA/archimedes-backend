import axios, { AxiosError } from 'axios';

import { config } from '@/config';
import { resolveApiUrlParams } from '@/shared/helpers/resolve-api-url-params';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import { InsuranceRequestPayload } from './insurance.types';
import { insuranceApiResolverDefault } from './insurance.constants';

const insuranceHttp = axios.create({
  baseURL: config.insuranceService.apiUrl,
});

export const parseApiError = (
  error: unknown,
  defaultErrorMessage: keyof typeof ErrorCodes = ErrorCodes.UNKNOWN_ERROR
) => {
  const axiosError = error as AxiosError;
  const errorMessage = (axiosError?.response?.data as { error: string })?.error;

  return {
    message: errorMessage || defaultErrorMessage,
    status:
      !axiosError?.response?.status || axiosError?.response?.status === 401
        ? 404
        : axiosError?.response?.status,
  };
};

export const insuranceRequest = async <T>({
  resolverName,
  payload = {},
  params = {},
  beneficiaryId,
}: InsuranceRequestPayload) => {
  try {
    const apiResolver =
      insuranceApiResolverDefault[resolverName as keyof typeof insuranceApiResolverDefault];
    const response = await insuranceHttp.request<T>({
      method: apiResolver.method,
      url: resolveApiUrlParams(resolverName, params),
      data: {
        ...apiResolver.defaultPayload,
        ...payload,
      },
      headers: {
        Authorization: beneficiaryId || '',
      },
    });
    return response.data;
  } catch (error) {
    const errorData = parseApiError(error);
    throw new AppError(errorData.message, errorData.status);
  }
};
