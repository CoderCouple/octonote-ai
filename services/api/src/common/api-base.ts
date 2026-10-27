/**
 * This API's own public origin (e.g. https://api.octonote.ai): the OAuth
 * issuer and the base of the MCP resource URL. PUBLIC_API_URL wins; else the
 * request's forwarded proto + host (Railway sets both).
 */
export function apiBase(headers: Record<string, string | string[] | undefined>): string {
  const fromEnv = process.env.PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
  const proto = first(headers["x-forwarded-proto"]) ?? "http";
  const host = first(headers["x-forwarded-host"]) ?? first(headers.host) ?? "localhost:4000";
  return `${proto}://${host}`;
}
