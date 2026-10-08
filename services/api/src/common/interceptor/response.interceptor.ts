/**
 * Wraps every successful controller return in BaseResponse<T>.
 *
 * Bypass cases:
 *   - StreamableFile responses (e.g., /public/i/:slug image bytes)
 *   - Anything where the controller has already shaped the result as a
 *     BaseResponse explicitly (idempotent re-wrap is avoided)
 */
import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { BaseResponse, successResponse } from "../../api/v1/response/base.response";
import { SKIP_RESPONSE_INTERCEPTOR } from "./skip-response-interceptor.decorator";

function isBaseResponse(value: unknown): value is BaseResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "statusCode" in value &&
    "success" in value &&
    "message" in value
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, BaseResponse<T> | T> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<BaseResponse<T> | T> {
    // Streaming endpoints (and other raw-response writers) opt out via
    // `@SkipResponseInterceptor()` — the controller has already written
    // to the wire by the time we'd try to wrap.
    const skip = Reflect.getMetadata(SKIP_RESPONSE_INTERCEPTOR, context.getHandler());
    if (skip) return next.handle();

    return next.handle().pipe(
      map((value: T) => {
        if (value instanceof StreamableFile) return value;
        if (isBaseResponse(value)) return value as BaseResponse<T>;
        const http = context.switchToHttp();
        const statusCode = http.getResponse<{ statusCode?: number }>().statusCode ?? HttpStatus.OK;
        return successResponse<T>(value ?? null, "Success", statusCode);
      }),
    );
  }
}
