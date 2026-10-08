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
export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, getBearerToken, fetchImpl } = config;
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

    const response = await doFetch(joinUrl(baseUrl, path), {
      ...init,
      headers,
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? (body as { message: string }).message
          : `${response.status}`;
      throw new Error(`Octonote API ${path} ${response.status}: ${message}`);
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
