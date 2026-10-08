/**
 * Legacy re-export path. The real implementations live in
 * `@octonote/api-client` so mobile + web share a single source of truth.
 * New code should import directly from the package.
 */
export {
  actionFailure,
  actionSuccess,
  isBaseResponse,
  unwrapBaseResponse,
  type ActionResponse,
  type BaseResponse,
} from "@octonote/api-client";
