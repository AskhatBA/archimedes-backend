/**
 * What an upstream service actually answered, kept on the error so the audit trail can
 * say *why* a request failed after the cause was mapped to one of our codes — an insurer
 * 404 "Пользователь не найден" otherwise surfaces only as `UNKNOWN_ERROR`.
 * Never put PII here: it is written to the audit log as is.
 */
export interface AppErrorDetails {
  service: string;
  resolver?: string | undefined;
  status?: number | undefined;
  errorCode?: number | string | undefined;
  message?: string | undefined;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details: AppErrorDetails | undefined;

  constructor(message: string, statusCode = 500, isOperational = true, details?: AppErrorDetails) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}
