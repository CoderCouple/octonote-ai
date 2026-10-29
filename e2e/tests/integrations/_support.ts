/**
 * Shared helpers for the API / CLI / MCP integration specs. LOCAL STACK ONLY:
 * reads the root `.env` (never `.env.hosted`), refuses to run against
 * anything that isn't localhost / a private LAN address, and never prints
 * env values.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect } from "@playwright/test";

function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("Couldn't find the repo root (pnpm-workspace.yaml) from " + process.cwd());
}

export const ROOT = findRoot();
process.loadEnvFile(join(ROOT, ".env"));

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/;

export const API = process.env.E2E_API_URL ?? "http://localhost:4000";
export const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!LOCAL.test(API)) throw new Error("Integration specs only run against a local API.");
if (!LOCAL.test(SUPABASE_URL)) throw new Error("Integration specs only run against a local Supabase.");

/** A fresh-enough tag to keep titles unique between runs. */
export const tag = () => Math.random().toString(36).slice(2, 8);

/** fetch that rides out a brief API restart (connection refused) by retrying. */
export async function rfetch(url: string, init?: RequestInit, tries = 30): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function waitForApi(timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch {
      /* restarting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("API /health didn't come up");
}

export interface Res<T = any> {
  status: number;
  body: any;
  result: T;
  headers: Headers;
}

/** Calls the API; `token` null = anonymous. Never throws on HTTP errors. */
export async function call<T = any>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  extraHeaders: Record<string, string> = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await rfetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: r.status, body: parsed, result: parsed?.result as T, headers: r.headers };
}

/** A signed-in API client. */
export class Client {
  constructor(
    readonly token: string,
    readonly workspaceId: string,
    readonly userId: string,
    readonly email: string,
  ) {}
  call<T = any>(method: string, path: string, body?: unknown) {
    return call<T>(method, path, body, this.token);
  }
  /** Like call() but asserts a 2xx and returns `result`. */
  async ok<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.call<T>(method, path, body);
    expect(r.status, `${method} ${path} → ${JSON.stringify(r.body).slice(0, 400)}`).toBeLessThan(300);
    return r.result;
  }
}

async function passwordSignIn(email: string, password: string) {
  const r = await rfetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error(`Supabase sign-in failed for an e2e user (${r.status})`);
  return j.access_token;
}

async function clientFor(email: string, password: string): Promise<Client> {
  await waitForApi();
  const token = await passwordSignIn(email, password);
  const me = await call("GET", "/me", undefined, token);
  if (me.status !== 200) throw new Error(`/me → ${me.status}`);
  const m = me.result.memberships.find((x: any) => x.membership.role === "OWNER") ?? me.result.memberships[0];
  return new Client(token, m.workspace.id, me.result.user.id, me.result.user.email);
}

/** The dev user (`pnpm dev:user`). */
export function devClient() {
  const { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } = process.env;
  if (!DEV_LOGIN_EMAIL || !DEV_LOGIN_PASSWORD) throw new Error("DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD missing in .env");
  return clientFor(DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD);
}

const OTHER_EMAIL = "e2e-outsider@octonote.local";
const OTHER_PASSWORD = "e2e-outsider-password-123";

/** A second local user with no access to the dev user's things (created via the Supabase admin API). */
export async function otherClient() {
  const r = await rfetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ email: OTHER_EMAIL, password: OTHER_PASSWORD, email_confirm: true, user_metadata: { name: "E2E Outsider" } }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string };
    const msg = String(j.msg ?? j.message ?? j.error_code ?? "");
    if (!/already|exists/i.test(msg)) throw new Error(`Couldn't create the second e2e user (${r.status})`);
  }
  return clientFor(OTHER_EMAIL, OTHER_PASSWORD);
}

/** Runs SQL on the LOCAL database; returns trimmed `-tA` output. */
export function sql(query: string): string {
  return execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8" }).trim();
}

/** JSON with sorted keys: jsonb doesn't keep key order, so compare canonically. */
export function canonical(v: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === "object"
        ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as any)[k])]))
        : x;
  return JSON.stringify(sort(v));
}

export function expectOctodraw(doc: any) {
  expect(doc, "octodraw document").toBeTruthy();
  expect(doc.version).toBe(1);
  expect(Array.isArray(doc.items)).toBe(true);
  for (const it of doc.items) {
    expect(typeof it.id).toBe("string");
    expect(typeof it.type).toBe("string");
  }
}

/** Items of one octodraw type. */
export const itemsOf = (doc: any, type: string) => (doc?.items ?? []).filter((i: any) => i.type === type);

/** 1×1 transparent PNG. */
export const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** A rich octodraw document exercising the newer fields. */
export function richDocument() {
  return {
    version: 1,
    items: [
      { id: "s1", type: "shape", shape: "rectangle", x: 0, y: 0, w: 160, h: 80, text: "Start", align: "left", valign: "top", dashed: true, fill: "none", color: "blue", link: "https://octonote.ai/docs" },
      { id: "s2", type: "shape", shape: "diamond", x: 320, y: 0, w: 120, h: 120, text: "Ok?", fill: "solid", color: "#ff8800", rotation: 15 },
      { id: "s3", type: "shape", shape: "ellipse", x: 0, y: 240, w: 140, h: 70, text: "End", align: "right", valign: "bottom", fill: "tint" },
      {
        id: "l1", type: "line", x: 0, y: 0, w: 0, h: 0,
        start: { x: 80, y: 40, item: "s1", anchor: { x: 1, y: 0.5 } },
        end: { x: 380, y: 60, item: "s2", anchor: { x: 0, y: 0.25 } },
        endArrow: true, dashed: true, bend: 42.5, text: "go",
      },
      { id: "l2", type: "line", x: 0, y: 0, w: 0, h: 0, start: { x: 380, y: 120, item: "s2" }, end: { x: 70, y: 275, item: "s3" }, startArrow: true, endArrow: true, bend: -30 },
      { id: "t1", type: "text", x: 500, y: 300, w: 200, h: 30, text: "Notes", fontSize: 20, bold: true, align: "center" },
      { id: "n1", type: "sticky", x: 600, y: 0, w: 150, h: 150, text: "Remember", color: "yellow" },
      { id: "f1", type: "frame", x: -50, y: -50, w: 900, h: 500, device: "browser", title: "Flow" },
      { id: "c1", type: "code", x: 0, y: 400, w: 300, h: 120, text: "const x = 1;", language: "ts" },
      { id: "p1", type: "pen", x: 700, y: 300, w: 50, h: 50, points: [[0, 0], [0.5, 1], [1, 0]] },
      { id: "i1", type: "icon", x: 760, y: 300, w: 32, h: 32, name: "star", locked: true },
    ],
  };
}

/** What a tldraw store snapshot looks like (what the old canvas engine saved). */
export function tldrawDocument() {
  return {
    store: {
      "document:document": { gridSize: 10, name: "", meta: {}, id: "document:document", typeName: "document" },
      "page:page": { meta: {}, id: "page:page", name: "Page 1", index: "a1", typeName: "page" },
      "shape:a": {
        x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, id: "shape:a", type: "geo",
        props: { w: 100, h: 50, geo: "rectangle", color: "black", fill: "none", dash: "draw", size: "m", text: "Hi" },
        parentId: "page:page", index: "a1", typeName: "shape",
      },
    },
    schema: { schemaVersion: 2, sequences: { "com.tldraw.store": 4, "com.tldraw.shape": 4 } },
  };
}

/** Deletes things the spec made; ignores ones already gone. */
export async function cleanup(c: Client, refs: { kind: "canvas" | "project" | "notebook" | "page"; id: string }[]) {
  const path = { canvas: "canvases", project: "projects", notebook: "notebooks", page: "pages" } as const;
  for (const r of refs.reverse()) await c.call("DELETE", `/${path[r.kind]}/${r.id}`).catch(() => {});
}
