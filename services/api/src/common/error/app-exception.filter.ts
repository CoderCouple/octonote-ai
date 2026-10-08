/**
 * Global exception filter. Converts whatever was thrown into the shared
 * BaseResponse<null> envelope so clients always parse one shape.
 *
 * Recognized inputs (most specific first):
 *   - AppError                  → carries code + extra
 *   - ZodError                  → 422, code VALIDATION_ERROR, issues in extra
 *   - HttpException             → preserves statusCode, code HTTP_EXCEPTION
 *   - Error / unknown           → 500, code UNEXPECTED_ERROR, message redacted in prod
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ZodError } from "zod";
import { errorResponse } from "../../api/v1/response/base.response";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { send: (body: unknown) => void };
    }>();

    const body = this.normalize(exception);
    response.status(body.statusCode).send(body);
  }

  private normalize(exception: unknown) {
    if (exception instanceof AppError) {
      return errorResponse(exception.message, exception.getStatus(), exception.code, exception.extra);
    }

    if (exception instanceof ZodError) {
      return errorResponse(
        "Request validation failed",
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_ERROR,
        { issues: exception.issues },
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === "string"
          ? raw
          : ((raw as { message?: string | string[] }).message as string | string[] | undefined);
      const flat = Array.isArray(message) ? message.join("; ") : (message ?? exception.message);
      return errorResponse(flat, status, ErrorCode.HTTP_EXCEPTION);
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const message =
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : exception instanceof Error
          ? exception.message
          : "Unknown error";
    return errorResponse(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.UNEXPECTED_ERROR);
  }
}
