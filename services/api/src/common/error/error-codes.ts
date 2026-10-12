/**
 * Stable error codes the api returns. Keys map to ErrorCode["NOT_FOUND"]
 * style usage; values are the wire strings clients see in
 * `{ error: { code, ... } }` envelopes.
 */
export const ErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  CONFLICT: "CONFLICT",
  /** A free-plan limit was hit (HTTP 402). Clients show the upgrade prompt. */
  PLAN_LIMIT: "PLAN_LIMIT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  HTTP_EXCEPTION: "HTTP_EXCEPTION",
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
