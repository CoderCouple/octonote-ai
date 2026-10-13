/**
 * The CLI's only door to Octonote: the public JSON API, with a bearer token.
 * Unwraps the API's `{ success, result, errorCode, message }` envelope and
 * turns every failure into a CliError with a stable code. Safe reads retry
 * on network errors and 502/503/504; writes never retry (no duplicates).
 */
import { CliError } from "./errors.js";

export interface HttpOptions {
  apiUrl: string;
  token: string | null;
  /** Per request; default 30s (markdown conversion of big notes can take a moment). */
  timeoutMs?: number;
  userAgent?: string;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiClient {
  constructor(private readonly opts: HttpOptions) {}

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  delete<T>(path: string, body?: unknown) {
    return this.request<T>("DELETE", path, body);
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const attempts = method === "GET" ? 3 : 1;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.once<T>(method, path, body);
      } catch (err) {
        last = err;
        const retryable =
          err instanceof CliError && (err.code === "NETWORK" || [502, 503, 504].includes(err.opts.status ?? 0));
        if (!retryable || i === attempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 400 * 2 ** i));
      }
    }
    throw last;
  }

  private async once<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.apiUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          "user-agent": this.opts.userAgent ?? "octonote-cli",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new CliError(
        timedOut ? "Octonote took too long to answer." : `Couldn't reach Octonote at ${this.opts.apiUrl}.`,
        "NETWORK",
        { hint: "Check your connection (or OCTONOTE_API_URL) and try again." },
      );
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (a proxy error page, say): reported below by status.
    }
    const envelope = isEnvelope(json) ? json : null;
    if (res.ok && (!envelope || envelope.success)) return (envelope ? envelope.result : json) as T;
    throw toCliError(res.status, envelope, text);
  }
}

interface Envelope {
  success: boolean;
  result: unknown;
  statusCode: number;
  message: string;
  errorCode?: string;
  extra?: Record<string, unknown>;
}

function isEnvelope(v: unknown): v is Envelope {
  return typeof v === "object" && v !== null && "success" in v && "statusCode" in v && "message" in v;
}

export function toCliError(status: number, envelope: Envelope | null, raw: string): CliError {
  const extra = envelope?.extra ?? {};
  // A specific code from the API (e.g. MERMAID_INVALID, WEB_SESSION_REQUIRED) wins over the generic one.
  const specific = typeof extra.code === "string" ? extra.code : null;
  const message = envelope?.message || raw.slice(0, 200) || `Request failed (${status}).`;
  const code =
    specific ??
    (status === 401
      ? "UNAUTHORIZED"
      : status === 402
        ? "PLAN_LIMIT"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status >= 500
              ? "SERVER_ERROR"
              : (envelope?.errorCode ?? "BAD_REQUEST"));
  const hint =
    code === "UNAUTHORIZED"
      ? "Your sign-in expired or was revoked. Run `octonote login` (or set a fresh OCTONOTE_TOKEN)."
      : code === "PLAN_LIMIT"
        ? "This workspace reached the Free plan limit. Upgrade at Settings → Plan & billing."
        : code === "NOT_FOUND"
          ? "Check the id — it may be deleted, or not shared with you."
          : code === "WEB_SESSION_REQUIRED"
            ? "Do this in the web app, signed in."
            : undefined;
  return new CliError(message, code, { status, hint, details: Object.keys(extra).length ? extra : undefined });
}
