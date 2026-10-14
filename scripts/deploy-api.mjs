#!/usr/bin/env node
/**
 * Deploys the API from this machine (`pnpm deploy:api`), retrying the
 * upload: Railway's upload endpoint often times out on the first try.
 * Normally you don't need this — pushing to main deploys the API from
 * GitHub. Use it to ship something that isn't pushed yet.
 */
import { spawnSync } from "node:child_process";

const ATTEMPTS = 4;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const res = spawnSync("railway", ["up", "--service", "api", "--detach"], { encoding: "utf8" });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.status === 0) {
    process.stdout.write(out.split("\n").filter((l) => !/agent tooling|railway setup agent|work much more effectively/i.test(l)).join("\n"));
    process.exit(0);
  }
  const transient = /timed out|error sending request|ECONNRESET|503|502/i.test(out);
  if (!transient || attempt === ATTEMPTS) {
    process.stderr.write(out);
    process.exit(res.status ?? 1);
  }
  const wait = attempt * 5;
  console.error(`Upload attempt ${attempt} timed out; retrying in ${wait}s…`);
  await new Promise((r) => setTimeout(r, wait * 1000));
}
