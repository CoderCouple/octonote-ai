/**
 * Envelope contracts shared by every fetch site + server action.
 *
 * `BaseResponse<T>` mirrors the API's response wire shape.
 * `unwrapBaseResponse` turns a raw JSON body into the underlying result
 * (or throws with a readable path-scoped message).
 */

export interface BaseResponse<T> {
  result: T | null;
  statusCode: number;
  message: string;
  success: boolean;
  errorCode?: string;
  extra?: Record<string, unknown>;
}

export function isBaseResponse(value: unknown): value is BaseResponse<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "statusCode" in value &&
    "message" in value &&
    "result" in value
  );
}

export function unwrapBaseResponse<T>(body: unknown, path: string): T {
  if (!isBaseResponse(body)) {
    // Legacy / unwrapped response (e.g. streamed binary or a route that
    // hasn't been upgraded yet). Pass through.
    return body as T;
  }
  if (!body.success) {
    const code = body.errorCode ? ` [${body.errorCode}]` : "";
    throw new Error(`Octonote API ${path} ${body.statusCode}${code}: ${body.message}`);
  }
  return body.result as T;
}
