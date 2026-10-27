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
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { AppModule } = require("./dist/modules/app.module");
// The real HTTP app, as main.ts builds it: adapter-level clashes (routes,
// content-type parsers) only surface here, not in an application context.
NestFactory.create(AppModule, new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 }), { rawBody: true, logger: ["error"], abortOnError: false })
  .then(async (app) => {
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
    const form = await fastify.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "grant_type=nope" });
    if (!form.body.includes("unsupported_grant_type")) throw new Error("form body not parsed: " + form.body);
    const icon = await fastify.inject({ method: "GET", url: "/favicon.ico" });
    if (icon.statusCode !== 302 || !String(icon.headers.location).endsWith("brand-logo-512.png")) throw new Error("favicon: " + icon.statusCode);
    await app.close(); console.log("BOOT_OK"); process.exit(0);
  })
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
