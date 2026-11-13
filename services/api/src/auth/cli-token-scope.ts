import type { CliTokenScope } from "../db/schemas/cli-tokens";
import { Forbidden } from "../common/error/error-factory";

export type { CliTokenScope };

/**
 * What a "clipper" token (the Octonote Clipper browser extension) may call:
 * list/create/open/rename collections and add, edit, reorder and remove clips,
 * plus revoking itself. Not composing, saving, deleting collections or
 * anything else — a leaked extension token can't read or change notes.
 * Routes live at the API root (no global prefix).
 */
const CLIPPER_ROUTES: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ["GET", /^\/collections$/],
  ["POST", /^\/collections$/],
  ["GET", /^\/collections\/[^/]+$/],
  ["PATCH", /^\/collections\/[^/]+$/],
  ["POST", /^\/collections\/[^/]+\/clips$/],
  ["POST", /^\/collections\/[^/]+\/order$/],
  ["PATCH", /^\/collections\/clips\/[^/]+$/],
  ["DELETE", /^\/collections\/clips\/[^/]+$/],
  ["DELETE", /^\/me\/cli-tokens\/current$/],
];

/**
 * What a "clipper_read" token adds, when the person allowed the extension to
 * read: listing their notes, canvases and projects and reading one they pick
 * to insert into a chat (as Markdown, or its canvas picture).
 */
const CLIPPER_READ_ROUTES: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ...CLIPPER_ROUTES,
  ["GET", /^\/extension\/items$/],
  ["GET", /^\/extension\/items\/[^/]+$/],
  ["GET", /^\/extension\/items\/[^/]+\/image$/],
];

const ROUTES_BY_SCOPE: Partial<Record<CliTokenScope, typeof CLIPPER_ROUTES>> = {
  clipper: CLIPPER_ROUTES,
  clipper_read: CLIPPER_READ_ROUTES,
};

export const CLIPPER_FORBIDDEN_MESSAGE = "This token can only add clips to collections.";

/** The request path without its query string or a trailing slash. */
function pathOf(url: string) {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Whether a token with `scope` may make this request. "full" may make any; an unknown scope none. */
export function cliTokenScopeAllows(scope: CliTokenScope, method: string, url: string): boolean {
  if (scope === "full") return true;
  const routes = Object.prototype.hasOwnProperty.call(ROUTES_BY_SCOPE, scope) ? ROUTES_BY_SCOPE[scope] : undefined;
  if (!routes) return false;
  const m = method.toUpperCase();
  const path = pathOf(url);
  return routes.some(([rm, re]) => rm === m && re.test(path));
}

export function assertCliTokenScope(scope: CliTokenScope, method: string | undefined, url: string | undefined) {
  if (!cliTokenScopeAllows(scope, method ?? "", url ?? "")) {
    throw Forbidden(CLIPPER_FORBIDDEN_MESSAGE, { code: "TOKEN_SCOPE" });
  }
}
