import axios, { AxiosResponse } from 'axios';

import { config } from '@/config';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import {
  WEBKASSA_ERROR,
  WebkassaAuthorizeData,
  WebkassaAuthorizeRequest,
  WebkassaCheckData,
  WebkassaCheckRequest,
  WebkassaResponse,
  WebkassaZReportData,
} from './webkassa.types';

/**
 * HTTP-клиент Webkassa.
 *
 * Здесь только транспорт: заголовок `x-api-key`, токен кассира с переавторизацией,
 * разбор `Errors[]` в `WebkassaError` и перебор альтернативных доменов при `505`. Что
 * делать с исходом, решает `fiscal.service`.
 *
 * Ни тело запроса, ни тело ответа целиком не логируются и не попадают в ошибки: в них
 * токен, пароль кассира и контакты покупателя. axios-ошибка тоже не пробрасывается как
 * есть — в её `config` лежит тело запроса строкой, которую редактор логов не видит.
 */

const clientLogger = createLogger('webkassa-client');

const REQUEST_TIMEOUT_MS = 20_000;

/** Токен кассира живёт в Redis, чтобы его делили все экземпляры бэкенда. */
const TOKEN_CACHE_KEY = 'webkassa:token';

const ENDPOINTS = {
  authorize: '/api/v4/Authorize',
  check: '/api/v4/check',
  zReport: '/api/v4/ZReport',
  ticketPrintFormat: '/api/v4/Ticket/PrintFormat',
} as const;

/** Webkassa сообщает о сбое домена кодом 505 и называет запасные хосты в этом заголовке. */
const ALTERNATIVE_DOMAINS_HEADER = 'alternativedomainnames';

/** Код 9 — это и ошибка валидации, и «параллельный запрос по кассе»; второе стоит повторить. */
const SEQUENTIAL_REQUEST_TEXT =
  /последовательн|параллельн|одновременн|sequential|parallel|concurren/i;

/** Коды, при которых повтор ничего не изменит: нужны люди (учётка, права, касса, данные). */
const NON_RETRYABLE_CODES = new Set<number>([
  WEBKASSA_ERROR.invalidCredentials,
  WEBKASSA_ERROR.noPermission,
  WEBKASSA_ERROR.noPermissionCashbox,
  WEBKASSA_ERROR.cashboxNotFound,
  WEBKASSA_ERROR.cashboxBlocked,
  WEBKASSA_ERROR.cashboxNotActivated,
]);

/**
 * Ошибка Webkassa или транспорта.
 *
 * `code` — код из `Errors[]`, `null` — ответа не было (сеть, таймаут) или он не по
 * протоколу (HTTP-ошибка без `Errors`). `data` — `Data`, пришедшая вместе с ошибкой (так
 * Webkassa отдаёт уже пробитый чек при коде 14); поле неперечислимое, чтобы целый объект
 * ошибки можно было логировать.
 */
export class WebkassaError extends Error {
  readonly code: number | null;

  readonly text: string;

  readonly retryable: boolean;

  readonly httpStatus: number | undefined;

  declare readonly data: unknown;

  constructor({
    code,
    text,
    retryable,
    httpStatus,
    data,
  }: {
    code: number | null;
    text: string;
    retryable: boolean;
    httpStatus?: number | undefined;
    data?: unknown;
  }) {
    super(code === null ? `Webkassa: ${text}` : `Webkassa error ${code}: ${text}`);
    this.name = 'WebkassaError';
    this.code = code;
    this.text = text;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
    Object.defineProperty(this, 'data', { value: data, enumerable: false });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const isWebkassaError = (error: unknown): error is WebkassaError =>
  error instanceof WebkassaError;

const isRetryableCode = (code: number, text: string): boolean => {
  if (NON_RETRYABLE_CODES.has(code)) return false;
  // 9 — валидация, кроме «запросы по кассе должны идти последовательно».
  if (code === WEBKASSA_ERROR.validation) return SEQUENTIAL_REQUEST_TEXT.test(text);
  // 14 без данных чека разбирает вызывающий: повтор вернёт то же самое.
  if (code === WEBKASSA_ERROR.duplicateExternalCheckNumber) return false;
  // Остальное (-1, 505, 11, 18, 2/3 после переавторизации, неизвестные коды) — повторяемо:
  // ExternalCheckNumber не даст пробить второй чек.
  return true;
};

const http = axios.create({
  baseURL: config.webkassa.apiUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
  // Webkassa отвечает 200 и на ошибки — исход определяется по `Errors[]`, а не по статусу.
  validateStatus: () => true,
});

const send = async <TData>(
  baseURL: string,
  path: string,
  body: object
): Promise<AxiosResponse<WebkassaResponse<TData>>> => {
  try {
    return await http.post<WebkassaResponse<TData>>(path, body, {
      baseURL,
      headers: { 'x-api-key': config.webkassa.apiKey },
    });
  } catch (error) {
    const axiosError = error as { code?: string; message?: string };
    // Только код и текст: в самой axios-ошибке лежит тело запроса с токеном и паролем.
    throw new WebkassaError({
      code: null,
      text: `${axiosError.code ?? 'NETWORK_ERROR'}: ${axiosError.message ?? 'request failed'}`,
      retryable: true,
    });
  }
};

const isDomainUnavailable = (response: AxiosResponse<WebkassaResponse<unknown>>): boolean =>
  response.status === WEBKASSA_ERROR.domainUnavailable ||
  Boolean(response.data?.Errors?.some((item) => item.Code === WEBKASSA_ERROR.domainUnavailable));

/** `AlternativeDomainNames` — список хостов; формат не документирован, поэтому разбираем мягко. */
const alternativeDomains = (response: AxiosResponse<unknown>): string[] => {
  const raw = response.headers?.[ALTERNATIVE_DOMAINS_HEADER];
  const value = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';

  return value
    .replace(/[[\]"]/g, ' ')
    .split(/[\s,;]+/)
    .map((host) => host.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .map((host) => (/^https?:\/\//i.test(host) ? host : `https://${host}`));
};

const toError = (response: AxiosResponse<WebkassaResponse<unknown>>): WebkassaError | null => {
  const errors = response.data?.Errors;

  if (Array.isArray(errors) && errors.length > 0) {
    const [first] = errors;
    const code = Number(first.Code);
    const text = errors
      .map((item) => item.Text)
      .filter(Boolean)
      .join('; ')
      .slice(0, 500);

    return new WebkassaError({
      code: Number.isFinite(code) ? code : WEBKASSA_ERROR.unknown,
      text: text || 'Неизвестная ошибка Webkassa',
      retryable: isRetryableCode(code, text),
      httpStatus: response.status,
      data: response.data?.Data,
    });
  }

  if (response.status >= 400) {
    // HTTP-ошибка без `Errors` — это не ответ API: неверный путь, прокси, падение сервера.
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
    return new WebkassaError({
      code: null,
      text: `HTTP ${response.status}`,
      retryable,
      httpStatus: response.status,
    });
  }

  if (response.data?.Data === undefined || response.data?.Data === null) {
    return new WebkassaError({
      code: WEBKASSA_ERROR.unknown,
      text: 'Пустой ответ Webkassa',
      retryable: true,
      httpStatus: response.status,
    });
  }

  return null;
};

/**
 * Один запрос к Webkassa: основной хост, а при `505` — по очереди запасные из заголовка
 * `AlternativeDomainNames`, в рамках той же попытки.
 */
const post = async <TData>(path: string, body: object): Promise<TData> => {
  let response = await send<TData>(config.webkassa.apiUrl, path, body);

  if (isDomainUnavailable(response)) {
    for (const host of alternativeDomains(response)) {
      clientLogger.warn({ path, host }, 'Webkassa domain unavailable, trying an alternative host');
      response = await send<TData>(host, path, body);
      if (!isDomainUnavailable(response)) break;
    }
  }

  const error = toError(response);
  if (error) throw error;

  return response.data.Data as TData;
};

/* -------------------------------------------------------------------------- */
/*                                 Авторизация                                 */
/* -------------------------------------------------------------------------- */

const authorize = async (): Promise<string> => {
  const body: WebkassaAuthorizeRequest = {
    Login: config.webkassa.login,
    Password: config.webkassa.password,
  };

  const data = await post<WebkassaAuthorizeData>(ENDPOINTS.authorize, body);

  if (!data?.Token) {
    throw new WebkassaError({
      code: WEBKASSA_ERROR.unknown,
      text: 'Authorize не вернул токен',
      retryable: true,
    });
  }

  const ttlSeconds = Math.max(60, Math.round(config.webkassa.tokenTtlMinutes * 60));
  await redisConnection.set(TOKEN_CACHE_KEY, data.Token, 'EX', ttlSeconds);

  clientLogger.info('Webkassa cashier authorized');

  return data.Token;
};

const getToken = async (): Promise<string> => {
  const cached = await redisConnection.get(TOKEN_CACHE_KEY);
  return cached || authorize();
};

/** Сбрасывает кэш токена — на случай, если Webkassa его отозвала. */
export const resetToken = async (): Promise<void> => {
  await redisConnection.del(TOKEN_CACHE_KEY);
};

const isSessionError = (error: unknown): boolean =>
  isWebkassaError(error) &&
  (error.code === WEBKASSA_ERROR.sessionExpired || error.code === WEBKASSA_ERROR.notAuthorized);

/**
 * Выполняет запрос с токеном кассира. На «сессия истекла» / «не авторизован» (2/3)
 * сбрасывает кэш, переавторизуется и повторяет запрос **один** раз.
 */
export const withToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
  const token = await getToken();

  try {
    return await fn(token);
  } catch (error) {
    if (!isSessionError(error)) throw error;

    clientLogger.info(
      { code: (error as WebkassaError).code },
      'Webkassa token rejected, re-authorizing once'
    );

    await resetToken();
    const fresh = await authorize();

    return fn(fresh);
  }
};

/* -------------------------------------------------------------------------- */
/*                                  Операции                                   */
/* -------------------------------------------------------------------------- */

/** Фискализация чека (`POST /api/v4/check`). */
export const createCheck = (
  body: Omit<WebkassaCheckRequest, 'Token'>
): Promise<WebkassaCheckData> =>
  withToken((token) => post<WebkassaCheckData>(ENDPOINTS.check, { ...body, Token: token }));

/** Z-отчёт — закрытие смены (`POST /api/v4/ZReport`). */
export const closeShift = (): Promise<WebkassaZReportData> =>
  withToken((token) =>
    post<WebkassaZReportData>(ENDPOINTS.zReport, {
      Token: token,
      CashboxUniqueNumber: config.webkassa.cashboxUniqueNumber,
    })
  );

/**
 * Печатная форма уже пробитого чека по внешнему номеру — для диагностики, когда в нашей
 * строке нет реквизитов, а в кабинете чек есть.
 */
export const getTicketByExternalCheckNumber = (
  externalCheckNumber: string,
  shiftNumber?: number
): Promise<{ Lines?: unknown[] }> =>
  withToken((token) =>
    post<{ Lines?: unknown[] }>(ENDPOINTS.ticketPrintFormat, {
      Token: token,
      CashboxUniqueNumber: config.webkassa.cashboxUniqueNumber,
      ExternalCheckNumber: externalCheckNumber,
      ...(shiftNumber !== undefined ? { ShiftNumber: shiftNumber } : {}),
      isDuplicate: false,
      paperKind: 0,
    })
  );
