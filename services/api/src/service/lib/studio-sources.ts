/**
 * Reading Studio sources into plain text: web pages and PDFs.
 *
 * A web page is a URL a stranger chose, so fetching it is an SSRF risk:
 *   - http(s) on the default ports only, no credentials in the URL;
 *   - every resolved address is checked inside the socket's lookup (no DNS
 *     rebinding), IP literals are checked directly, and each redirect (at
 *     most 4) is checked again;
 *   - 10 s timeout, 3 MB cap, HTML or plain text only.
 */
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPrivateAddress, safeLookup } from "./cimd-fetch";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;

export class SourceError extends Error {}

export interface PageText {
  title: string;
  text: string;
  url: string;
}

function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SourceError("That doesn't look like a web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SourceError("Only http and https links can be read.");
  if (u.username || u.password) throw new SourceError("Links with a user name or password can't be read.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new SourceError("Only links on the standard web ports can be read.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) throw new SourceError("That address is on a private network.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new SourceError("That address is on a private network.");
  return u;
}

function get(u: URL): Promise<{ res: IncomingMessage; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = u.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(
      u,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "accept-language": "en;q=0.9,*;q=0.5",
          "user-agent": "Mozilla/5.0 (compatible; OctonoteStudio/1.0; +https://octonote.ai)",
        },
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          return resolve({ res, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new SourceError("That page is too large to read."));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
      },
    );
    req.on("timeout", () => req.destroy(new SourceError("That page took too long to load.")));
    req.on("error", (err) =>
      reject(
        err instanceof SourceError
          ? err
          : new SourceError(
              (err as NodeJS.ErrnoException).code === "EPRIVATE"
                ? "That address is on a private network."
                : /CERT|SSL|TLS/.test(String((err as NodeJS.ErrnoException).code))
                  ? "That page's security certificate couldn't be verified."
                  : "That page couldn't be reached.",
              { cause: err },
            ),
      ),
    );
    req.end();
  });
}

/** Fetches a web page and returns its readable text. */
export async function readWebPage(raw: string): Promise<PageText> {
  let u = checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const { res, body } = await get(u);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      if (hop >= MAX_REDIRECTS) throw new SourceError("That link redirects too many times.");
      u = checkUrl(new URL(res.headers.location, u).toString());
      continue;
    }
    if (status !== 200) throw new SourceError(`That page answered with an error (HTTP ${status}).`);
    const type = String(res.headers["content-type"] ?? "").toLowerCase();
    if (type && !/text\/html|application\/xhtml|text\/plain/.test(type)) {
      throw new SourceError(type.includes("pdf") ? "That link is a PDF: download it and upload it as a PDF instead." : "That link isn't a web page.");
    }
    const charset = /charset=([\w-]+)/.exec(type)?.[1] ?? "utf-8";
    let decoded: string;
    try {
      decoded = new TextDecoder(charset).decode(body);
    } catch {
      decoded = new TextDecoder("utf-8").decode(body);
    }
    if (type.includes("text/plain")) return { title: u.hostname, text: tidy(decoded), url: u.toString() };
    const page = htmlToText(decoded);
    return { title: page.title || u.hostname, text: page.text, url: u.toString() };
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The readable part of an HTML page as text with light markdown (headings and
 * list bullets): scripts, navigation, headers, footers, sidebars and forms are
 * dropped, and the article or main element is preferred when there is one.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i").exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i").exec(html)?.[1];
  const title = decodeEntities(meta("og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|canvas|select|button)\b[\s\S]*?<\/\1>/gi, " ");
  const pick = (tag: string) => {
    const blocks = [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]!);
    return blocks.sort((a, b) => b.length - a.length)[0];
  };
  body = pick("article") ?? pick("main") ?? /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(body)?.[1] ?? body;
  body = body.replace(/<(nav|header|footer|aside|form|figure)\b[\s\S]*?<\/\1>/gi, " ");

  const text = body
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n\n${"#".repeat(Math.min(Number(n) + 1, 4))} `)
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|li|ul|ol|blockquote|pre|table|tr)>/gi, "\n")
    .replace(/<(p|div|section|blockquote|pre|table|tr)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "");
  return { title, text: tidy(decodeEntities(text)) };
}

/** The text of a PDF, page by page. Refuses files that aren't PDFs. */
export async function readPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw new SourceError("That file isn't a PDF.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new SourceError("That PDF couldn't be opened. It may be damaged or password-protected.");
  }
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t) => tidy(t)).filter(Boolean);
  if (!pages.length) throw new SourceError("That PDF has no text to read (it may be scanned images).");
  return { text: pages.join("\n\n"), pages: totalPages };
}
