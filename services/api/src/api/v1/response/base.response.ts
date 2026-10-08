/**
 * Generic API response envelope. Every endpoint resolves into this shape
 * so clients can rely on a stable contract:
 *
 *   { result, statusCode, message, success }
 *
 * The ResponseInterceptor wraps successful controller returns; the
 * AppExceptionFilter wraps thrown errors.
 */
export interface BaseResponse<T = unknown> {
  result: T | null;
  statusCode: number;
  message: string;
  success: boolean;
  errorCode?: string;
  extra?: Record<string, unknown>;
}

export function successResponse<T>(
  result: T | null = null,
  message = "Success",
  statusCode = 200,
): BaseResponse<T> {
  return { result, statusCode, message, success: true };
}

export function errorResponse(
  message = "Something went wrong",
  statusCode = 500,
  errorCode = "SERVER_ERROR",
  extra?: Record<string, unknown>,
): BaseResponse<null> {
  return {
    result: null,
    statusCode,
    message,
    success: false,
    errorCode,
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  };
}
