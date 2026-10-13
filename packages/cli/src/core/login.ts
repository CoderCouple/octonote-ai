/**
 * `octonote login`: open the browser on <web>/cli/connect, where you click
 * Authorize; the page hands the new token to this process over a one-shot
 * server on 127.0.0.1. The server only accepts a POST from the Octonote
 * site carrying the random `state` we generated, then shuts down. If the
 * browser can't reach it, the page shows the token to paste here instead.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname } from "node:os";
import { createInterface } from "node:readline";
import { CliError } from "./errors.js";

export interface LoginResult {
  token: string;
  email: string | null;
}

export const TOKEN_RE = /^ont_[A-Za-z0-9_-]{20,}$/;

export function openBrowser(url: string): boolean {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd as string, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function browserLogin(opts: {
  webUrl: string;
  onUrl: (url: string) => void;
  timeoutMs?: number;
}): Promise<LoginResult> {
  const state = randomBytes(24).toString("base64url");
  const origin = new URL(opts.webUrl).origin;

  let settle!: (r: LoginResult) => void;
  let fail!: (e: Error) => void;
  const result = new Promise<LoginResult>((res, rej) => {
    settle = res;
    fail = rej;
  });

  const server = createServer((req, res) => handle(req, res));
  const cors = (res: ServerResponse) => {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    // Chrome's Private Network Access: a public site may call localhost only if we say so.
    res.setHeader("access-control-allow-private-network", "true");
    res.setHeader("cache-control", "no-store");
  };
  function handle(req: IncomingMessage, res: ServerResponse) {
    cors(res);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/cb") return void res.writeHead(404).end();
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method !== "POST" || (req.headers.origin && req.headers.origin !== origin)) {
      return void res.writeHead(403).end();
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      let data: { state?: string; token?: string; email?: string } = {};
      try {
        data = JSON.parse(body);
      } catch {
        // Fall through to the checks below.
      }
      if (data.state !== state || !data.token || !TOKEN_RE.test(data.token)) {
        return void res.writeHead(400).end();
      }
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      settle({ token: data.token, email: data.email || null });
    });
  }

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => res());
  });
  const port = (server.address() as { port: number }).port;
  const url = `${opts.webUrl}/cli/connect?${new URLSearchParams({
    cb: `http://127.0.0.1:${port}/cb`,
    state,
    name: hostname().split(".")[0] ?? "",
  }).toString()}`;
  opts.onUrl(url);
  openBrowser(url);

  // Paste fallback: a person can paste the token the page shows.
  let rl: ReturnType<typeof createInterface> | null = null;
  if (process.stdin.isTTY) {
    rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      const token = line.trim();
      if (TOKEN_RE.test(token)) settle({ token, email: null });
    });
  }
  const timer = setTimeout(
    () => fail(new CliError("Timed out waiting for the browser.", "LOGIN_TIMEOUT", { hint: "Run `octonote login` again." })),
    opts.timeoutMs ?? 5 * 60_000,
  );
  try {
    return await result;
  } finally {
    clearTimeout(timer);
    rl?.close();
    server.close();
  }
}
