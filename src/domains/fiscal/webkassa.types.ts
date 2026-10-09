/**
 * Webkassa API (протокол 2.0.4), как он описан в Postman-коллекции «ИНТЕГРАТОРЫ - 2.0.4».
 *
 * Имена полей — в PascalCase, как в самом API: эти объекты уходят в Webkassa и приходят
 * оттуда без преобразований.
 */

/** `OperationType` чека. */
export const WEBKASSA_OPERATION = {
  sale: 2,
  saleReturn: 3,
} as const;

/** `PositionType`: 2 — услуга. Обязателен для протокола 2.0.4. */
export const WEBKASSA_POSITION_TYPE_SERVICE = 2;

/** `UnitCode` 5114 — «одн.усл.» из справочника `RefUnits`. */
export const WEBKASSA_UNIT_CODE_SERVICE = 5114;

/** `RoundType` 0 — без округления итога: суммы до тиына, как списал FreedomPay. */
export const WEBKASSA_ROUND_TYPE_NONE = 0;

/** Коды ошибок Webkassa, на которые завязана логика. */
export const WEBKASSA_ERROR = {
  invalidCredentials: 1,
  sessionExpired: 2,
  notAuthorized: 3,
  noPermission: 4,
  noPermissionCashbox: 5,
  cashboxNotFound: 6,
  cashboxBlocked: 7,
  validation: 9,
  cashboxNotActivated: 10,
  shiftOver24h: 11,
  shiftAlreadyClosed: 12,
  noOpenShift: 13,
  duplicateExternalCheckNumber: 14,
  checkNotFound: 16,
  offlineOver72h: 18,
  domainUnavailable: 505,
  unknown: -1,
} as const;

export interface WebkassaErrorItem {
  Code: number;
  Text: string;
}

/** Любой ответ Webkassa: `Data` при успехе, непустой `Errors` при ошибке (бывает и то, и другое). */
export interface WebkassaResponse<TData> {
  Data?: TData;
  Errors?: WebkassaErrorItem[];
}

export interface WebkassaAuthorizeRequest {
  Login: string;
  Password: string;
}

export interface WebkassaAuthorizeData {
  Token: string;
}

export interface WebkassaPosition {
  Count: number;
  Price: number;
  /** 0 — без НДС, 100 — НДС. */
  TaxType: number;
  TaxPercent: number;
  /** НДС в цене позиции: `Price * p / (100 + p)`, до сотых. */
  Tax: number;
  PositionName: string;
  PositionCode?: string;
  PositionType: number;
  UnitCode: number;
}

export interface WebkassaPayment {
  Sum: number;
  /** 0 — наличные, 1 — карта, 4 — мобильный платёж. */
  PaymentType: number;
}

export interface WebkassaReturnBasisDetails {
  CheckNumber: string;
  RegistrationNumber: string;
  /** `YYYY-MM-DD HH:mm:ss`, время кассы (Asia/Almaty). */
  DateTime: string;
  Total: number;
  IsOffline: boolean;
}

export interface WebkassaCheckRequest {
  Token: string;
  CashboxUniqueNumber: string;
  OperationType: number;
  Positions: WebkassaPosition[];
  Payments: WebkassaPayment[];
  Change: number;
  RoundType: number;
  /** Ключ идемпотентности: повтор с тем же номером возвращает ошибку 14 и уже пробитый чек. */
  ExternalCheckNumber: string;
  ExternalOrderNumber?: string;
  CustomerEmail?: string;
  CustomerPhone?: string;
  ReturnBasisDetails?: WebkassaReturnBasisDetails;
}

export interface WebkassaCheckData {
  /** Фискальный признак. */
  CheckNumber: string;
  /** `dd.MM.yyyy HH:mm:ss` — время кассы. */
  DateTime?: string;
  /** `dd.MM.yyyy HH:mm:ss +05:00`. */
  DateTimeUTC?: string;
  OfflineMode?: boolean;
  CashboxOfflineMode?: boolean;
  Cashbox?: {
    UniqueNumber?: string;
    /** РНК. */
    RegistrationNumber?: string;
    IdentityNumber?: string;
  };
  CheckOrderNumber?: number;
  ShiftNumber?: number;
  /** Ссылка ОФД (она же QR). */
  TicketUrl?: string;
  /** Печатная форма Webkassa. */
  TicketPrintUrl?: string;
  Total?: number;
  ExternalCheckNumber?: string;
}

export interface WebkassaZReportRequest {
  Token: string;
  CashboxUniqueNumber: string;
}

export interface WebkassaZReportData {
  ShiftNumber?: number;
  ReportNumber?: number;
  CloseOn?: string;
}
