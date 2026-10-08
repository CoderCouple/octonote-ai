import { SetMetadata } from "@nestjs/common";

/**
 * Mark a controller method so the global ResponseInterceptor skips it.
 * Use this on routes that write to `@Res()` directly — streaming
 * endpoints, file downloads, etc. — where the BaseResponse wrap would
 * collide with bytes already on the wire.
 */
export const SKIP_RESPONSE_INTERCEPTOR = "skip-response-interceptor";
export const SkipResponseInterceptor = () => SetMetadata(SKIP_RESPONSE_INTERCEPTOR, true);
