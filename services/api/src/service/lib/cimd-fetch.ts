/**
 * Fetches an OAuth Client ID Metadata Document (MCP auth spec 2026-07-28):
 * the client_id is an https URL and the JSON at it describes the client.
 * Fetching a URL a stranger chose is an SSRF risk, so:
 *   - https only, default port, no credentials in the URL, no redirects;
 *   - every resolved address is checked inside the socket's own lookup, so
 *     a DNS rebind between "check" and "connect" can't reach a private IP;
 *   - 5 s timeout, 64 KB cap, JSON only.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 64 * 1024;

export class CimdError extends Error {}

/** Loopback, private, link-local, CGNAT, multicast, unspecified — never fetched. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

/** Whether a client_id looks like a CIMD URL (https with a path), per the spec. */
export function isCimdClientId(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return u.protocol === "https:" && u.pathname.length > 1;
  } catch {
    return false;
  }
}

function safeLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`Refusing to fetch ${hostname}: private address`), { code: "EPRIVATE" }), []);
    }
    const all = (options as { all?: boolean }).all;
    if (all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

export function fetchClientMetadata(url: string): Promise<Record<string, unknown>> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {
    return Promise.reject(new CimdError("client_id must be a plain https URL"));
  }
  if (isIP(u.hostname)) return Promise.reject(new CimdError("client_id must use a host name"));

  return new Promise((resolve, reject) => {
    const req = request(
      u,
      { method: "GET", headers: { accept: "application/json" }, lookup: safeLookup as never, timeout: TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new CimdError(`client metadata returned HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new CimdError("client metadata is too large"));
          } else chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            const doc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error();
            resolve(doc as Record<string, unknown>);
          } catch {
            reject(new CimdError("client metadata is not a JSON object"));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new CimdError("client metadata fetch timed out")));
    req.on("error", (err) => reject(err instanceof CimdError ? err : new CimdError(err.message)));
    req.end();
  });
}
