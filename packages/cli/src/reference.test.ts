import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram, VERSION } from "./index.js";
import { buildReference } from "./reference.js";

describe("docs reference", () => {
  it("matches the CLI (regenerate with `pnpm --filter @octonote/cli build`)", () => {
    const file = join(
      __dirname,
      "../../../apps/web/src/app/(marketing)/cli/_data/reference.json",
    );
    const expected = `${JSON.stringify(buildReference(buildProgram(), VERSION), null, 2)}\n`;
    expect(readFileSync(file, "utf8")).toBe(expected);
  });

  it("documents every command with a description", () => {
    const ref = buildReference(buildProgram(), VERSION);
    expect(ref.commands.length).toBeGreaterThan(25);
    for (const c of ref.commands) expect(c.description, c.name).toBeTruthy();
  });
});

describe("version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "../package.json"), "utf8"),
    );
    expect(VERSION).toBe(pkg.version);
  });
});
