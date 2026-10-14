#!/usr/bin/env node
// The hosted API's address lives in ONE place: API_URL in .env.hosted.
// This pushes it to everything that needs it:
//   - the web app: NEXT_PUBLIC_API_URL on Vercel (production), then a redeploy
//     (NEXT_PUBLIC_ values are baked in at build time)
//   - the mobile app: regenerates apps/mobile/.env.local if the app is on hosted
//   - Stripe: prints the webhook URL to paste into the dashboard
//
//   pnpm api-url:sync            check API_URL answers, then sync + redeploy
//   pnpm api-url:sync --dry-run  show what would change
//   pnpm api-url:sync --force    skip the /health check
//
// The `octonote` CLI defaults to https://api.octonote.ai (the domain we own),
// so it doesn't need syncing. Values are read from .env.hosted; secrets are
// never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const hosted = Object.fromEntries(
  readFileSync(path.join(root, ".env.hosted"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);

const apiUrl = (hosted.API_URL ?? "").replace(/\/+$/, "");
let parsed;
try {
  parsed = new URL(apiUrl);
} catch {
  console.error("✗ API_URL in .env.hosted is missing or not a URL (e.g. API_URL=https://api.octonote.ai).");
  process.exit(1);
}
if (parsed.protocol !== "https:") {
  console.error(`✗ API_URL must be https:// (got ${apiUrl}).`);
  process.exit(1);
}
console.log(`API_URL = ${apiUrl}${dryRun ? "   (dry run: nothing changes)" : ""}`);

// 1. Is the API actually answering there? Pointing the site at a dead URL would take it down.
if (!force) {
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("✓ API answers at /health");
  } catch (err) {
    console.error(`✗ ${apiUrl}/health isn't answering (${err.message}). Fix DNS / the domain first, or pass --force.`);
    process.exit(1);
  }
}

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { cwd: root, input, stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"], encoding: "utf8" });

// 2. Web app on Vercel.
if (dryRun) {
  console.log("• would set NEXT_PUBLIC_API_URL (production) on Vercel and redeploy the web app");
} else {
  try {
    run("vercel", ["env", "rm", "NEXT_PUBLIC_API_URL", "production", "--yes"]);
  } catch {
    // Not set yet: fine.
  }
  run("vercel", ["env", "add", "NEXT_PUBLIC_API_URL", "production"], apiUrl);
  console.log("✓ Vercel: NEXT_PUBLIC_API_URL updated (production)");
  console.log("… redeploying the web app (NEXT_PUBLIC_ values are built in) — takes ~3 minutes");
  const out = run("vercel", ["deploy", "--prod", "--yes"]);
  const url = out.match(/https:\/\/\S+\.vercel\.app/)?.[0];
  console.log(`✓ Web app redeployed${url ? `: ${url}` : ""}`);
}

// 3. Mobile app (only when it's currently pointed at hosted).
const mobileLocal = path.join(root, "apps/mobile/.env.local");
if (existsSync(mobileLocal)) {
  if (dryRun) console.log("• would regenerate apps/mobile/.env.local (pnpm mobile:env hosted)");
  else {
    run("node", ["scripts/mobile-env.mjs", "hosted"]);
    console.log("✓ Mobile: apps/mobile/.env.local regenerated — restart Expo with --clear");
  }
} else {
  console.log("• Mobile is on local settings; `pnpm mobile:env hosted` will pick up the new API_URL");
}

// 4. Stripe — the dashboard is the only place for this.
console.log(`\nStripe webhook URL (Developers → Webhooks → your endpoint → Edit):\n  ${apiUrl}/billing/webhook`);
