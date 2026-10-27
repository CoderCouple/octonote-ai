// The test account app-directory reviewers (Anthropic, OpenAI) sign in with.
// Reviewers need instant access — no email code, no 2FA — so this account has
// a password, and the login page shows "App reviewer? Sign in with a password"
// while NEXT_PUBLIC_REVIEWER_LOGIN=true on Vercel.
//
//   pnpm reviewer:account                   create, or re-apply the saved password
//   pnpm reviewer:account --new-password    generate a new password and apply it
//   (or edit REVIEWER_PASSWORD in .env.hosted and run it again to use your own)
//
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and API_URL
// from .env.hosted. Creates (or resets the password of) REVIEWER_EMAIL
// (default review@octonote.ai), stores REVIEWER_EMAIL / REVIEWER_PASSWORD in
// .env.hosted, signs in once so the workspace exists, and adds a little sample
// content the first time. Prints the email, never the password.
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env.hosted", import.meta.url);
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const need = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "API_URL"];
const missing = need.filter((k) => !env[k]);
if (missing.length) {
  console.error(`.env.hosted is missing: ${missing.join(", ")}`);
  process.exit(1);
}

const email = env.REVIEWER_EMAIL || "review@octonote.ai";
const fresh = process.argv.includes("--new-password");
const password = (!fresh && env.REVIEWER_PASSWORD) || randomBytes(18).toString("base64url");
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

function saveEnv(key, value) {
  const text = readFileSync(envPath, "utf8");
  if (new RegExp(`^${key}=`, "m").test(text)) {
    writeFileSync(envPath, text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`));
  } else {
    appendFileSync(envPath, `${text.endsWith("\n") ? "" : "\n"}${key}=${value}\n`);
  }
}

// 1. Create the user, or reset its password if it exists.
let res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: admin,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: "App Reviewer" } }),
});
if (!res.ok) {
  const body = await res.text();
  if (!/already|registered|exists/i.test(body)) throw new Error(`Couldn't create the reviewer: ${res.status} ${body}`);
  const list = await (await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json();
  const user = (list.users ?? []).find((u) => u.email === email);
  if (!user) throw new Error("The reviewer exists but couldn't be found to reset its password.");
  res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: admin,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`Couldn't reset the reviewer's password: ${res.status} ${await res.text()}`);
}
saveEnv("REVIEWER_EMAIL", email);
saveEnv("REVIEWER_PASSWORD", password);

// 2. Sign in like the reviewer will, so the API creates the workspace.
const session = await (
  await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
).json();
if (!session.access_token) throw new Error(`Password sign-in failed: ${JSON.stringify(session)}`);
const api = async (method, path, body) => {
  const r = await fetch(`${env.API_URL.replace(/\/$/, "")}${path}`, {
    method,
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(json)}`);
  return json.result;
};
const me = await api("GET", "/me");
const ws = (me.memberships.find((m) => m.membership.role === "OWNER") ?? me.memberships[0]).workspace.id;

// 3. Sample content, only the first time.
const notebooks = await api("GET", `/workspaces/${ws}/notebooks`);
if (!notebooks.some((n) => n.name === "Getting started")) {
  const nb = await api("POST", `/workspaces/${ws}/notebooks`, { name: "Getting started" });
  await api("POST", `/workspaces/${ws}/pages`, {
    title: "Welcome to Octonote",
    notebookId: nb.id,
    markdown: [
      "# Welcome to Octonote",
      "",
      "Notes and diagrams your assistant can write for you.",
      "",
      "## Try asking",
      "",
      "- [ ] *List my notebooks*",
      "- [ ] *Create a note about caching with a diagram*",
      "- [ ] *Draw a login flow as a canvas*",
      "",
      "## Math and diagrams",
      "",
      "Cache hit rate: $h = \\frac{hits}{hits + misses}$",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[Request] --> B{In cache?}",
      "  B -->|yes| C[Return]",
      "  B -->|no| D[(Database)] --> C",
      "```",
    ].join("\n"),
  });
  await api("POST", `/workspaces/${ws}/canvases`, {
    title: "Signup flow",
    notebookId: nb.id,
    mermaid: "flowchart LR\n  U((Visitor)) --> S[Sign-up page]\n  S --> V{Email code ok?}\n  V -->|yes| W[Workspace]\n  V -->|no| S",
  });
  console.log("Added sample content to the 'Getting started' notebook.");
}

console.log(`Reviewer account ready: ${email}${fresh ? " (new password set)" : ""}`);
console.log("Password saved in .env.hosted as REVIEWER_PASSWORD (paste it into the directory forms; never commit it).");
