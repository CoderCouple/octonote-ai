import { saveSession, signIn } from "./helpers/auth";
import { API_URL, WEB_URL } from "./helpers/env";

/** Signs the dev user in once; tests read the stored tokens (never printed). */
export default async function globalSetup(): Promise<void> {
  for (const [name, url] of [["API", `${API_URL}/health`], ["web", WEB_URL]] as const) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    if (!ok) throw new Error(`The local ${name} server isn't answering at ${url}. Start the local stack first (see e2e/README section in CLAUDE.md).`);
  }
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) throw new Error("DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD missing from the root .env (run `pnpm dev:user`).");
  saveSession(await signIn(email, password));
}
