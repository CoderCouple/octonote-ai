/**
 * Starts the whole API the way production does: the Nest build (which emits
 * the decorator metadata Nest's injection reads — Vitest's compiler doesn't),
 * then every module, provider and controller in AppModule. The integration
 * harness wires services by hand, so a controller asking for a provider its
 * module can't see only fails here — not on Railway after deploy.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

const BOOT = `
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("./dist/modules/app.module");
NestFactory.createApplicationContext(AppModule, { logger: ["error"], abortOnError: false })
  .then(async (app) => { await app.close(); console.log("BOOT_OK"); process.exit(0); })
  .catch((e) => { console.error(e && e.message); process.exit(1); });
`;

describe("API boot", () => {
  it("builds and starts every module, provider and controller", { timeout: 120_000 }, () => {
    execFileSync("pnpm", ["build"], { cwd: root, stdio: "pipe" });
    const run = spawnSync(process.execPath, ["-e", BOOT], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      // Only what construction needs; the postgres client connects lazily, so nothing is reached.
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgres://boot:boot@127.0.0.1:1/boot",
        SUPABASE_URL: "http://127.0.0.1:1",
        SUPABASE_SERVICE_ROLE_KEY: "boot",
      },
    });
    expect(run.stderr + run.stdout).toContain("BOOT_OK");
  });
});
