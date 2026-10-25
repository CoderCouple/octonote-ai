#!/usr/bin/env node
// Builds @octonote/cli and puts its package on octonote.ai. The install line is
// `npm i -g @octonote/cli` (on npm since 2026-10-24); this copy keeps the old
//   npm i -g https://octonote.ai/cli/octonote-cli.tgz
// working for anyone who still has it. Writes, under apps/web/public/cli/:
//   octonote-cli-<version>.tgz   this version, never overwritten
//   octonote-cli.tgz             the latest (what the old install line uses)
//   latest.json                  { version, file, integrity }
// Then commit and deploy the web app.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "packages/cli");
const out = path.join(root, "apps/web/public/cli");
mkdirSync(out, { recursive: true });

execFileSync("pnpm", ["--filter", "@octonote/cli", "build"], { cwd: root, stdio: "inherit" });
const [packed] = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", out], { cwd: cli, encoding: "utf8" }),
);
const versioned = path.join(out, packed.filename);
copyFileSync(versioned, path.join(out, "octonote-cli.tgz"));
writeFileSync(
  path.join(out, "latest.json"),
  `${JSON.stringify({ version: packed.version, file: packed.filename, integrity: packed.integrity }, null, 2)}\n`,
);
console.log(`✓ @octonote/cli ${packed.version} → apps/web/public/cli/ (${packed.filename}, octonote-cli.tgz)`);
console.log("  Install: npm i -g https://octonote.ai/cli/octonote-cli.tgz");
