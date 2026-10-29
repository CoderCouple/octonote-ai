/** The `octonote` CLI against the local API, with a CLI token made through the web-session API. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { API, call, cleanup, devClient, expectOctodraw, itemsOf, ROOT, tag, type Client } from "./_support";

const BIN = join(ROOT, "packages/cli/dist/index.js");
const WEB = "http://localhost:3000";

let c: Client;
let token: string;
let tokenId: string;
let dir: string;
const made: { kind: "canvas" | "project" | "page"; id: string }[] = [];

interface Run {
  code: number;
  json: any;
  stdout: string;
  stderr: string;
}

function cli(args: string[], opts: { token?: string } = {}): Run {
  const r = spawnSync(process.execPath, [BIN, "--json", ...args], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      OCTONOTE_CONFIG_DIR: join(dir, "config"),
      OCTONOTE_API_URL: API,
      OCTONOTE_WEB_URL: WEB,
      OCTONOTE_TOKEN: opts.token ?? token,
    },
  });
  let json: any = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON */
  }
  return { code: r.status ?? -1, json, stdout: r.stdout, stderr: r.stderr };
}
const ok = (args: string[]) => {
  const r = cli(args);
  expect(r.code, `octonote ${args.join(" ")}\n${r.stdout}\n${r.stderr}`).toBe(0);
  return r.json;
};
const file = (name: string, text: string) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

test.beforeAll(async () => {
  // tsc only (the full build also regenerates the docs reference).
  execFileSync("pnpm", ["--filter", "@octonote/cli", "exec", "tsc", "-p", "tsconfig.json"], { cwd: ROOT, stdio: "pipe" });
  c = await devClient();
  const t = await c.ok("POST", "/me/cli-tokens", { name: `E2E cli ${tag()}` });
  token = t.plaintext;
  tokenId = t.token.id;
  expect(token).toMatch(/^ont_/);
  dir = mkdtempSync(join(tmpdir(), "octonote-e2e-cli-"));
});
test.afterAll(async () => {
  await cleanup(c, made);
  if (tokenId) await c.call("DELETE", `/me/cli-tokens/${tokenId}`);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("whoami works with the token", () => {
  const me = ok(["whoami"]);
  expect(JSON.stringify(me)).toContain(c.email);
});

test("canvas create --from-mermaid, redraw, pull, edit + push", async () => {
  const title = `E2E cli canvas ${tag()}`;
  const mm = file("flow.mmd", 'flowchart LR\n  A[Start] -->|go| B{Check}\n  B -.-> C[Done]\n  click C "https://octonote.ai/done"\n');
  const created = ok(["canvas", "create", title, "--from-mermaid", mm]);
  made.push({ kind: "canvas", id: created.id });
  expect(created).toMatchObject({ kind: "canvas", title });
  expect(created.id).toMatch(/^cnv_/);
  expect(created.url).toMatch(new RegExp(`^${WEB}/[a-z]+/${created.id}$`));
  const row = await c.ok("GET", `/canvases/${created.id}`);
  expectOctodraw(row.document);
  expect(itemsOf(row.document, "shape").map((s: any) => s.text).sort()).toEqual(["Check", "Done", "Start"]);
  expect(itemsOf(row.document, "shape").find((s: any) => s.text === "Done").link).toBe("https://octonote.ai/done");

  const redrawn = ok(["canvas", "redraw", created.id, "--from-mermaid", file("two.mmd", "graph TD\n  X[One] --> Y[Two]\n")]);
  expect(redrawn.id).toBe(created.id);
  const out = join(dir, "c.json");
  const pulled = ok(["canvas", "pull", created.id, "-o", out]);
  expect(pulled.file).toBe(out);
  const doc = JSON.parse(readFileSync(out, "utf8"));
  expectOctodraw(doc);
  expect(itemsOf(doc, "shape").map((s: any) => s.text).sort()).toEqual(["One", "Two"]);

  // Edit: add a bent dashed line and a sticky, then push.
  doc.items.push({ id: "e2e-sticky", type: "sticky", x: 400, y: 0, w: 120, h: 120, text: "Pushed" });
  doc.items.push({ id: "e2e-line", type: "line", x: 0, y: 0, w: 0, h: 0, start: { x: 0, y: 0, item: doc.items[0].id }, end: { x: 400, y: 60, item: "e2e-sticky", anchor: { x: 0, y: 0.5 } }, dashed: true, bend: 25, endArrow: true });
  writeFileSync(out, JSON.stringify(doc));
  const pushed = ok(["canvas", "push", out, "--id", created.id]);
  expect(pushed.id).toBe(created.id);
  const after = await c.ok("GET", `/canvases/${created.id}`);
  expect(after.document).toEqual(doc);
});

test("canvas create from JSON and empty", async () => {
  const empty = ok(["canvas", "create", `E2E cli empty ${tag()}`]);
  made.push({ kind: "canvas", id: empty.id });
  expect((await c.ok("GET", `/canvases/${empty.id}`)).document).toEqual({ version: 1, items: [] });
  const doc = { version: 1, items: [{ id: "s", type: "shape", shape: "ellipse", x: 0, y: 0, w: 50, h: 50, text: "J", fill: "solid" }] };
  const fromJson = ok(["canvas", "create", `E2E cli json ${tag()}`, "-f", file("d.json", JSON.stringify(doc))]);
  made.push({ kind: "canvas", id: fromJson.id });
  expect((await c.ok("GET", `/canvases/${fromJson.id}`)).document).toEqual(doc);
});

test("project create --canvas-mermaid --note, publish/unpublish", async () => {
  const name = `E2E cli project ${tag()}`;
  const p = ok(["project", "create", name, "--note", file("n.md", "# Hello\n\nNote body.\n"), "--canvas-mermaid", file("p.mmd", "flowchart TD\n  A[Idea] --> B[Plan]\n"), "--view", "canvas"]);
  made.push({ kind: "project", id: p.id });
  expect(p.id).toMatch(/^prj_/);
  expect(p.canvasId).toMatch(/^cnv_/);
  expect(p.url).toBeTruthy();
  const canvas = await c.ok("GET", `/canvases/${p.canvasId}`);
  expectOctodraw(canvas.document);
  expect(itemsOf(canvas.document, "shape").map((s: any) => s.text).sort()).toEqual(["Idea", "Plan"]);

  const pub = ok(["publish", p.id]);
  expect(pub).toMatchObject({ kind: "project", id: p.id, published: true });
  expect(pub.publicUrl).toMatch(/\/pub\//);
  const slug = pub.publicUrl.split("/pub/")[1];
  const view = await call("GET", `/public/${slug}`, undefined, null);
  expect(view.status).toBe(200);
  expectOctodraw(view.result.resource.canvas.document);

  const un = ok(["unpublish", p.id]);
  expect(un.published).toBe(false);
  expect((await call("GET", `/public/${slug}`, undefined, null)).status).toBe(404);
});

test("canvas create --publish prints publicUrl; list --kind canvas and search find it; delete --yes", async () => {
  const title = `E2E cli findme ${tag()}`;
  const created = ok(["canvas", "create", title, "-m", file("f.mmd", "graph LR\n  A --> B\n"), "--publish"]);
  made.push({ kind: "canvas", id: created.id });
  expect(created.publicUrl).toMatch(/\/pub\//);

  const list = ok(["list", "--kind", "canvas"]);
  expect(Array.isArray(list)).toBe(true);
  const row = list.find((i: any) => i.id === created.id);
  expect(row).toMatchObject({ kind: "canvas", title });
  expect(list.every((i: any) => i.kind === "canvas")).toBe(true);

  const found = ok(["search", ...title.split(" ").slice(2)]);
  expect(found.map((i: any) => i.id)).toContain(created.id);

  const del = ok(["delete", created.id, "--yes"]);
  expect(del).toEqual({ kind: "canvas", id: created.id, deleted: true });
  expect((await c.call("GET", `/canvases/${created.id}`)).status).toBe(404);
  expect(ok(["search", ...title.split(" ").slice(2)]).map((i: any) => i.id)).not.toContain(created.id);
});

test.describe("errors", () => {
  test("delete without --yes is a usage error (exit 2) and deletes nothing", async () => {
    const canvas = ok(["canvas", "create", `E2E cli keep ${tag()}`]);
    made.push({ kind: "canvas", id: canvas.id });
    const r = cli(["delete", canvas.id]);
    expect(r.code).toBe(2);
    expect(r.json.error.code).toBe("USAGE");
    expect((await c.call("GET", `/canvases/${canvas.id}`)).status).toBe(200);
  });

  test("push of non-canvas JSON / non-JSON is a usage error", async () => {
    const canvas = ok(["canvas", "create", `E2E cli push ${tag()}`]);
    made.push({ kind: "canvas", id: canvas.id });
    for (const text of ["not json", JSON.stringify({ hello: 1 }), JSON.stringify({ version: 2, items: [] })]) {
      const r = cli(["canvas", "push", file("bad.json", text), "--id", canvas.id]);
      expect(r.code, text).toBe(2);
      expect(r.json.error.code).toBe("USAGE");
      expect(r.json.error.hint).toBeTruthy();
    }
  });

  test("an unsupported diagram fails with an error code and leaves nothing behind", async () => {
    const title = `E2E cli seq ${tag()}`;
    const r = cli(["canvas", "create", title, "-m", file("seq.mmd", "sequenceDiagram\n  A->>B: hi\n")]);
    expect(r.code).not.toBe(0);
    expect(r.json.error.code).toBeTruthy();
    expect(r.json.error.message).toMatch(/flowchart/i);
    const list = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`);
    expect(list.some((x) => x.title === title)).toBe(false);

    const pname = `E2E cli bad project ${tag()}`;
    const rp = cli(["project", "create", pname, "--canvas-mermaid", join(dir, "seq.mmd")]);
    expect(rp.code).not.toBe(0);
    const projects = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/projects`);
    expect(projects.some((x) => x.name === pname)).toBe(false);
  });

  test("unknown ids → NOT_FOUND (exit 4); bad id → USAGE; bad token → exit 3", () => {
    const nf = cli(["canvas", "pull", "cnv_00000000-0000-0000-0000-000000000000", "-o", join(dir, "x.json")]);
    expect(nf.code).toBe(4);
    expect(nf.json.error.code).toBe("NOT_FOUND");
    const bad = cli(["canvas", "pull", "hello"]);
    expect(bad.code).toBe(2);
    expect(bad.json.error.code).toBe("USAGE");
    const unauth = cli(["list"], { token: "ont_not_a_real_token" });
    expect(unauth.code).toBe(3);
    expect(["UNAUTHORIZED", "NOT_LOGGED_IN"]).toContain(unauth.json.error.code);
    const kind = cli(["list", "--kind", "spreadsheet"]);
    expect(kind.code).toBe(2);
  });
});
