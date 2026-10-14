import { describe, expect, it } from "vitest";
import { upsertSection } from "../commands/agents.js";
import { parseFrontMatter, withFrontMatter } from "./frontmatter.js";
import { toCliError } from "./http.js";
import { parseRef } from "./refs.js";

const ID = "pag_0b6f1c8e-2d4a-4b6e-9f00-123456789abc";

describe("front matter", () => {
  it("round-trips the note id and title (quotes and colons included)", () => {
    const text = withFrontMatter(
      { octonote: ID, title: 'Plan: "v2"' },
      "# Hi\n",
    );
    const { data, body } = parseFrontMatter(text);
    expect(data).toEqual({ octonote: ID, title: 'Plan: "v2"' });
    expect(body).toBe("# Hi\n");
  });
  it("leaves files without front matter alone", () => {
    expect(parseFrontMatter("# Just markdown")).toEqual({
      data: {},
      body: "# Just markdown",
    });
  });
});

describe("ids", () => {
  it("reads the kind from the prefix, also inside URLs", () => {
    expect(parseRef(ID)).toEqual({ kind: "page", id: ID });
    expect(parseRef(`https://octonote.ai/n/${ID}`).id).toBe(ID);
    expect(parseRef(ID.replace("pag_", "ntb_")).kind).toBe("notebook");
  });
  it("rejects junk and the wrong kind with a usage error", () => {
    expect(() => parseRef("hello")).toThrow(/isn't an Octonote id/);
    expect(() => parseRef(ID, "canvas")).toThrow(/is a note, not a canvas/);
  });
});

describe("API errors", () => {
  const env = (
    statusCode: number,
    errorCode: string,
    extra?: Record<string, unknown>,
  ) => ({
    success: false,
    result: null,
    statusCode,
    message: "nope",
    errorCode,
    extra,
  });
  it("maps statuses to stable codes with hints and exit codes", () => {
    const auth = toCliError(401, env(401, "UNAUTHORIZED"), "");
    expect([auth.code, auth.exitCode]).toEqual(["UNAUTHORIZED", 3]);
    expect(auth.hint).toMatch(/octonote login/);
    expect(toCliError(402, env(402, "PLAN_LIMIT"), "").exitCode).toBe(5);
    expect(toCliError(404, env(404, "NOT_FOUND"), "").exitCode).toBe(4);
    expect(toCliError(503, null, "Bad gateway").code).toBe("SERVER_ERROR");
  });
  it("prefers the API's specific code", () => {
    const e = toCliError(
      400,
      env(400, "BAD_REQUEST", { code: "MERMAID_INVALID", line: 2 }),
      "",
    );
    expect(e.code).toBe("MERMAID_INVALID");
    expect(e.toJSON().error.details).toEqual({
      code: "MERMAID_INVALID",
      line: 2,
    });
  });
});

describe("setup section", () => {
  it("adds once, then updates in place, keeping the rest of the file", () => {
    const first = upsertSection("# My project\n\nRules.\n", "## Octonote v1");
    expect(first).toContain(
      "# My project\n\nRules.\n\n<!-- octonote:start -->\n## Octonote v1\n<!-- octonote:end -->",
    );
    const second = upsertSection(
      `${first}\n## Later section\n`,
      "## Octonote v2",
    );
    expect(second).not.toContain("v1");
    expect(second.match(/octonote:start/g)).toHaveLength(1);
    expect(second).toContain("## Later section");
    expect(upsertSection("", "## X")).toBe(
      "<!-- octonote:start -->\n## X\n<!-- octonote:end -->\n",
    );
  });
});

describe("API address", () => {
  it("saves only custom addresses, never the default or a retired one", async () => {
    const { customUrl, DEFAULT_API_URL } = await import("./config.js");
    expect(customUrl(DEFAULT_API_URL, DEFAULT_API_URL)).toBeUndefined();
    expect(
      customUrl("https://api-production-fb09.up.railway.app/", DEFAULT_API_URL),
    ).toBeUndefined();
    expect(customUrl("http://localhost:4000/", DEFAULT_API_URL)).toBe(
      "http://localhost:4000",
    );
  });

  it("ignores a retired address left in an old config", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "octonote-cfg-"));
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ apiUrl: "https://api-production-fb09.up.railway.app" }),
    );
    process.env.OCTONOTE_CONFIG_DIR = dir;
    const { resolveConfig, DEFAULT_API_URL } = await import("./config.js");
    expect((await resolveConfig()).apiUrl).toBe(DEFAULT_API_URL);
    delete process.env.OCTONOTE_CONFIG_DIR;
  });
});
