/**
 * Base error class for everything we throw from controllers/services.
 * Extends Nest's HttpException so the framework still routes it via the
 * exception filter — but carries a structured `code` + optional `extra`
 * so clients get a consistent envelope rather than free-form messages.
 */
import { HttpException } from "@nestjs/common";
import { ErrorCode } from "./error-codes";

export class AppError extends HttpException {
  readonly code: ErrorCode;
  readonly extra: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    extra?: Record<string, unknown>,
  ) {
    super({ code, message, extra: extra ?? {} }, statusCode);
    this.code = code;
    this.extra = extra ?? {};
  }
}
