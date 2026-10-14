import { unwrapBaseResponse } from "./base-response";

export type BearerTokenSource =
  | (() => string | null | undefined)
  | (() => Promise<string | null | undefined>);

export interface ApiClientConfig {
  baseUrl: string;
  /**
   * Called before every request. Return `null`/`undefined` for anonymous
   * calls (e.g. `/health`) or a Supabase access token for authed calls.
   * Web SSR pulls from a cookie-backed Supabase client; browser + mobile
   * pull from their respective client-side sessions.
   */
  getBearerToken?: BearerTokenSource;
  /**
   * Which app is calling ("web" | "mobile"), sent as `x-octonote-client` so
   * the API can count active users per app. A function is asked per request.
   */
  client?: string | (() => string | Promise<string>);
  /** Injected for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(path: string, init?: RequestInit): Promise<T>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/**
 * Build a bearer-auth API client for the Octonote backend.
 *
 * The client is stateless — auth is resolved per-request via
 * `getBearerToken`, and the underlying `fetch` is used with
 * `cache: 'no-store'` so callers never need to think about caching.
 */
/**
 * A non-2xx API response. `message` keeps the old "Octonote API <path> <status>: …"
 * text; `reason` is just the server's sentence and `code` its error code
 * (e.g. "PLAN_LIMIT" with HTTP 402), so callers can react without parsing.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string,
    readonly code: string | null,
    readonly extra: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, getBearerToken, fetchImpl, client } = config;
  const doFetch = fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (getBearerToken) {
      const token = await getBearerToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }
    if (client) {
      headers.set("x-octonote-client", typeof client === "function" ? await client() : client);
    }

    const response = await doFetch(joinUrl(baseUrl, path), {
      ...init,
      headers,
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const b = (body && typeof body === "object" ? body : {}) as {
        message?: unknown;
        errorCode?: unknown;
        extra?: unknown;
      };
      const message = typeof b.message === "string" ? b.message : `${response.status}`;
      throw new ApiError(
        `Octonote API ${path} ${response.status}: ${message}`,
        response.status,
        message,
        typeof b.errorCode === "string" ? b.errorCode : null,
        (b.extra as Record<string, unknown> | undefined) ?? {},
      );
    }
    return unwrapBaseResponse<T>(body, path);
  }

  function withBody(method: string) {
    return function <T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
      return request<T>(path, {
        ...init,
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    };
  }

  return {
    request,
    get: (path, init) => request(path, { ...(init ?? {}), method: "GET" }),
    post: withBody("POST"),
    patch: withBody("PATCH"),
    put: withBody("PUT"),
    delete: (path, init) => request(path, { ...(init ?? {}), method: "DELETE" }),
  };
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
