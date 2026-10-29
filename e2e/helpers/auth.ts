import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { API_URL, AUTH_FILE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  workspaceId: string;
}

/** Supabase password grant for the dev user (`pnpm dev:user`). */
export async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; user?: { id: string } };
  if (!tok.access_token || !tok.refresh_token)
    throw new Error(`Sign-in failed (${res.status}). Run \`pnpm dev:user\` and check DEV_LOGIN_EMAIL/PASSWORD.`);
  const me = await fetch(`${API_URL}/me`, { headers: { authorization: `Bearer ${tok.access_token}` } }).then(
    (r) => r.json() as Promise<{ result?: { memberships?: { workspaceId?: string; workspace?: { id: string } }[] } }>,
  );
  const m = me.result?.memberships?.[0];
  const workspaceId = m?.workspaceId ?? m?.workspace?.id;
  if (!workspaceId) throw new Error("The dev user has no workspace (GET /me).");
  return { accessToken: tok.access_token, refreshToken: tok.refresh_token, userId: tok.user!.id, email, workspaceId };
}

export function saveSession(session: Session): void {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify(session), { mode: 0o600 });
}

let cached: Session | null = null;
export function readSession(): Session {
  cached ??= JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Session;
  return cached;
}
