import axios, { AxiosError } from 'axios';
import Sentry from '@sentry/node';

import { config } from '@/config';
import { createLogger } from '@/shared/lib/logger';
import { resolveApiUrlParams } from '@/shared/helpers/resolve-api-url-params';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import { InsuranceRequestPayload } from './insurance.types';
import { insuranceApiResolverDefault } from './insurance.constants';

const insuranceLogger = createLogger('insurance');

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
  query = {},
  beneficiaryId,
}: InsuranceRequestPayload) => {
  const apiResolver =
    insuranceApiResolverDefault[resolverName as keyof typeof insuranceApiResolverDefault];
  const startedAt = Date.now();
  let url: string | undefined;

  try {
    url = resolveApiUrlParams(resolverName, params);

    const response = await insuranceHttp.request<T>({
      method: apiResolver.method,
      url,
      data: {
        ...apiResolver.defaultPayload,
        ...payload,
      },
      params: query,
      headers: {
        Authorization: beneficiaryId === null ? null : beneficiaryId || '',
      },
    });

    insuranceLogger.debug(
      {
        resolverName,
        method: apiResolver?.method,
        url,
        query,
        status: response.status,
        durationMs: Date.now() - startedAt,
      },
      'Insurance request completed'
    );

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;

    insuranceLogger.error(
      {
        resolverName,
        method: apiResolver?.method,
        url,
        query,
        status: axiosError?.response?.status,
        durationMs: Date.now() - startedAt,
        responseData: axiosError?.response?.data,
        err: error,
      },
      'Insurance request failed'
    );

    const errorData = parseApiError(error);
    const responseData = axiosError?.response?.data as
      | { errorCode?: number; message?: string; error?: string }
      | undefined;

    Sentry.captureException(error);
    throw new AppError(errorData.message, errorData.status, true, {
      service: 'insurance',
      resolver: resolverName,
      status: axiosError?.response?.status,
      errorCode: responseData?.errorCode,
      // No response at all means a timeout or a refused connection — axios says which.
      message: responseData?.message ?? responseData?.error ?? axiosError?.message,
    });
  }
};
