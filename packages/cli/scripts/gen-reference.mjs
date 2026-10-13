#!/usr/bin/env node
// Writes the command reference the octonote.ai/cli docs page renders
// (apps/web/src/app/(marketing)/cli/_data/reference.json) from the built CLI.
// Runs after `tsc` in the package's build. `--check` exits 1 if it's stale.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(
  here,
  "../../../apps/web/src/app/(marketing)/cli/_data/reference.json",
);
const { buildProgram, VERSION } = await import("../dist/index.js");
const { buildReference } = await import("../dist/reference.js");
const json = `${JSON.stringify(buildReference(buildProgram(), VERSION), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {}
  if (current !== json) {
    console.error(
      "✗ CLI docs reference is stale. Run: pnpm --filter @octonote/cli build",
    );
    process.exit(1);
  }
  console.log("✓ CLI docs reference is up to date");
} else {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`✓ wrote ${path.relative(path.resolve(here, "../../.."), out)}`);
}
