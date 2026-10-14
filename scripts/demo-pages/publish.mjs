#!/usr/bin/env node
// Creates and publishes Octonote's outreach examples in your workspace:
// 5 projects (note + canvas), 5 standalone notes and 5 standalone canvases,
// all collected in one published "Octonote examples" notebook.
//
//   node scripts/demo-pages/publish.mjs --dry-run                 build + validate only, writes out/
//   node scripts/demo-pages/publish.mjs --email you@example.com   emails you a 6-digit sign-in code
//   node scripts/demo-pages/publish.mjs --email you@example.com --code 123456 [--set notes,canvases,notebook]
//
// --set picks what to create (default: notes,canvases,notebook). "update" creates nothing: it
// rewrites the notes of the already-published projects and notes in out/published.json in
// place (same URLs) from the current content — e.g. after a builder fix. "projects" creates the five
// projects again — only needed on a fresh workspace; already-published projects listed in
// out/published.json are moved into the notebook instead of re-created.
// Other options: --env hosted|local (default hosted), --workspace <id>, --notebook <id> (reuse one).
// Credentials are read from .env.hosted (or .env for local) and never printed.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toMarkdown } from "./build.mjs";
import { projects } from "./content.mjs";
import { notes } from "./notes.mjs";
import { canvases } from "./canvases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const sets = new Set(String(args.set ?? "notes,canvases,notebook").split(","));

const NOTEBOOK = {
  name: "Octonote examples",
  icon: "✨",
};

// ---------- build (always) ----------
const outDir = path.join(here, "out");
mkdirSync(outDir, { recursive: true });
const dump = (name, data) => writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2));
for (const d of projects) dump(`project-${d.slugHint}`, { ...d, contentMd: toMarkdown(d.blocks) });
for (const d of notes) dump(`note-${d.slugHint}`, { ...d, contentMd: toMarkdown(d.blocks) });
for (const d of canvases) dump(`canvas-${d.slugHint}`, d);
console.log(
  `Built ${projects.length} projects, ${notes.length} notes, ${canvases.length} canvases (canvases validated) → ${path.relative(root, outDir)}/`,
);
if (args["dry-run"]) process.exit(0);

// ---------- config ----------
function readEnv(file) {
  const p = path.join(root, file);
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, "")]),
  );
}
const isLocal = args.env === "local";
const env = { ...readEnv(isLocal ? ".env" : ".env.hosted"), ...process.env };
const pick = (...keys) => keys.map((k) => env[k]).find(Boolean);
const SUPABASE_URL = pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") ??
  (isLocal ? "http://127.0.0.1:54321" : "https://xdjeshxjvrbgksgmurnh.supabase.co");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const API_URL = (pick("API_URL", "NEXT_PUBLIC_API_URL") ??
  (isLocal ? "http://localhost:4000" : "https://api-production-fb09.up.railway.app")).replace(/\/$/, "");
const WEB_URL = (pick("PUBLIC_APP_URL", "NEXT_PUBLIC_APP_URL", "WEB_URL") ??
  (isLocal ? "http://localhost:3000" : "https://octonote.ai")).replace(/\/$/, "");
if (!ANON_KEY) fail(`No Supabase anon/publishable key found in ${isLocal ? ".env" : ".env.hosted"}.`);
if (!args.email) fail("Pass --email <your Octonote sign-in email>.");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---------- auth (email + 6-digit code, same as mobile sign-in) ----------
async function auth(pathname, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Sign-in ${pathname} failed: ${json.msg ?? json.error_description ?? res.status}`);
  return json;
}

if (!args.code) {
  await auth("otp", { email: args.email, create_user: false });
  console.log(`✓ Sent a 6-digit code to ${args.email}. Re-run with --code <code>.`);
  process.exit(0);
}
const { access_token: token } = await auth("verify", { type: "email", email: args.email, token: String(args.code) });

// ---------- API ----------
async function api(method, pathname, body) {
  const res = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json && json.success === false)) {
    fail(`${method} ${pathname} → ${res.status}: ${json?.message ?? "request failed"}`);
  }
  return json && typeof json === "object" && "success" in json ? json.result : json;
}
async function publish(kind, id) {
  const pub = await api("PUT", `/${kind}/${id}/publish`, { published: true });
  return pub.publicUrl ?? (pub.publicSlug ? `${WEB_URL}/pub/${pub.publicSlug}` : null);
}

let workspaceId = args.workspace;
if (!workspaceId) {
  const me = await api("GET", "/me");
  const pair = me.memberships.find((m) => m.membership.role === "OWNER") ?? me.memberships[0];
  if (!pair) fail("No workspace found for this account.");
  workspaceId = pair.workspace.id;
  console.log(`Using workspace “${pair.workspace.name}” (pass --workspace <id> to pick another)`);
}

// Results so far (older runs wrote a plain array of projects).
const resultsPath = path.join(outDir, "published.json");
const prev = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : {};
const results = Array.isArray(prev) ? { projects: prev } : { projects: [], ...prev };
const save = () => writeFileSync(resultsPath, JSON.stringify(results, null, 2));

// ---------- update in place ----------
if (sets.has("update")) {
  for (const d of projects) {
    const r = results.projects?.find((p) => p.name === d.name);
    if (!r) continue;
    const project = await api("GET", `/projects/${r.projectId}`);
    if (!project.noteId) continue;
    await api("PATCH", `/pages/${project.noteId}`, { document: { blocks: d.blocks }, contentMd: toMarkdown(d.blocks) });
    console.log(`✓ Updated project note  ${d.name}`);
  }
  for (const d of notes) {
    const r = results.notes?.find((x) => x.name === d.title);
    if (!r) continue;
    await api("PATCH", `/pages/${r.pageId}`, { document: { blocks: d.blocks }, contentMd: toMarkdown(d.blocks) });
    console.log(`✓ Updated note          ${d.title}`);
  }
  console.log("\nDone — same URLs, refreshed content.");
  process.exit(0);
}

// ---------- notebook ----------
let notebookId = args.notebook ?? results.notebook?.id ?? null;
if (sets.has("notebook") && !notebookId) {
  const nb = await api("POST", `/workspaces/${workspaceId}/notebooks`, NOTEBOOK);
  notebookId = nb.id;
  results.notebook = { id: nb.id, name: NOTEBOOK.name, url: null };
  save();
  console.log(`✓ Notebook “${NOTEBOOK.name}”`);
}

// ---------- projects ----------
if (sets.has("projects")) {
  results.projects = [];
  for (const d of projects) {
    const project = await api("POST", `/workspaces/${workspaceId}/projects`, {
      name: d.name,
      description: d.description,
      icon: d.icon,
      ...(notebookId ? { notebookId } : {}),
    });
    await api("PATCH", `/projects/${project.id}`, { settings: { defaultView: "split" } });
    await api("PATCH", `/pages/${project.noteId}`, {
      title: d.name,
      document: { blocks: d.blocks },
      contentMd: toMarkdown(d.blocks),
    });
    await api("PATCH", `/canvases/${project.canvasId}`, { title: d.name, document: d.canvas });
    const url = await publish("project", project.id);
    results.projects.push({ name: d.name, projectId: project.id, url });
    save();
    console.log(`✓ Project  ${d.name}\n    ${url}`);
  }
} else if (notebookId) {
  for (const p of results.projects ?? []) {
    await api("POST", `/projects/${p.projectId}/move`, { notebookId });
    console.log(`✓ Moved project into notebook: ${p.name}`);
  }
}

// ---------- notes ----------
if (sets.has("notes")) {
  results.notes = [];
  for (const d of notes) {
    const page = await api("POST", `/workspaces/${workspaceId}/pages`, {
      title: d.title,
      ...(notebookId ? { notebookId } : {}),
    });
    await api("PATCH", `/pages/${page.id}`, { document: { blocks: d.blocks }, contentMd: toMarkdown(d.blocks) });
    const url = await publish("page", page.id);
    results.notes.push({ name: d.title, level: d.level, pageId: page.id, url });
    save();
    console.log(`✓ Note     [${d.level}] ${d.title}\n    ${url}`);
  }
}

// ---------- canvases ----------
if (sets.has("canvases")) {
  results.canvases = [];
  for (const d of canvases) {
    const cv = await api("POST", `/workspaces/${workspaceId}/canvases`, {
      title: d.title,
      ...(notebookId ? { notebookId } : {}),
    });
    await api("PATCH", `/canvases/${cv.id}`, { document: d.canvas });
    const url = await publish("canvas", cv.id);
    results.canvases.push({ name: d.title, level: d.level, canvasId: cv.id, url });
    save();
    console.log(`✓ Canvas   [${d.level}] ${d.title}\n    ${url}`);
  }
}

// ---------- publish the notebook last, so it lists everything ----------
if (sets.has("notebook") && notebookId) {
  results.notebook.url = await publish("notebook", notebookId);
  save();
  console.log(`\n✓ Notebook published — one link to all examples:\n    ${results.notebook.url}`);
}
console.log(`\nDone. Open each canvas once in the app so its thumbnail is generated.`);
