/**
 * Local-stack settings for the browser suite. Values come from the repo's
 * root `.env` (loaded, never printed). This suite must never point at
 * production: `assertLocal` refuses any non-local URL.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(E2E_DIR, "..");

let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = resolve(ROOT, ".env");
  // process.loadEnvFile never overrides variables already set in the shell.
  if (existsSync(file)) process.loadEnvFile(file);
}

export function assertLocal(url: string, what: string): string {
  const host = new URL(url).hostname;
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!local) throw new Error(`${what} must be a local URL for e2e tests (got host ${host}).`);
  return url.replace(/\/$/, "");
}

loadEnv();

export const WEB_URL = assertLocal(process.env.E2E_WEB_URL ?? "http://localhost:3000", "E2E_WEB_URL");
export const API_URL = assertLocal(process.env.E2E_API_URL ?? "http://localhost:4000", "E2E_API_URL");
export const SUPABASE_URL = assertLocal(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321", "SUPABASE_URL");
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
/** Local Supabase Postgres (fixed by `supabase start`). */
export const DATABASE_URL = assertLocal(
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "E2E_DATABASE_URL",
);
export const AUTH_FILE = resolve(E2E_DIR, ".auth/session.json");
