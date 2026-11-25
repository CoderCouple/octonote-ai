import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";

const WS = "wsp_1";
const uuid = (n: number) => `0b6f1c8e-2d4a-4b6e-9f00-${String(n).padStart(12, "0")}`;
const CLC = `clc_${uuid(1)}`;
const CLP = [1, 2, 3].map((n) => `clp_${uuid(n)}`);
const PAG = `pag_${uuid(4)}`;
const CNV = `cnv_${uuid(5)}`;
const STU = `stu_${uuid(6)}`;
const VID = `vid_${uuid(7)}`;
const DCK = `dck_${uuid(8)}`;
const NTB = `ntb_${uuid(9)}`;

type Call = { method: string; path: string; body: unknown; timeout: boolean };
type Route = (call: Call) => unknown;

let calls: Call[];
let routes: Record<string, Route>;
let out: string;
let dir: string;

const ok = (result: unknown) =>
  new Response(JSON.stringify({ success: true, statusCode: 200, message: "", result }), { status: 200 });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "octonote-cli-"));
  process.env.OCTONOTE_CONFIG_DIR = dir;
  process.env.OCTONOTE_TOKEN = "tok";
  process.env.OCTONOTE_WORKSPACE = WS;
  process.env.OCTONOTE_API_URL = "https://api.test";
  process.env.OCTONOTE_WEB_URL = "https://app.test";
  calls = [];
  out = "";
  routes = {
    "GET /me": () => ({
      user: { id: "usr_me", name: "Me", email: "me@example.com" },
      memberships: [{ membership: { role: "OWNER" }, workspace: { id: WS, name: "Mine", slug: "mine" } }],
    }),
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const call: Call = {
      method: init.method ?? "GET",
      path: u.pathname + u.search,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      timeout: Boolean(init.signal),
    };
    calls.push(call);
    const route = routes[`${call.method} ${u.pathname}`];
    if (!route)
      return new Response(JSON.stringify({ success: false, statusCode: 404, message: "Not found", result: null }), { status: 404 });
    const result = route(call);
    return result instanceof Response ? result : ok(result);
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  process.exitCode = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const run = async (...args: string[]) => {
  await buildProgram().parseAsync(["node", "octonote", "--json", ...args]);
  return JSON.parse(out);
};
const sent = (method: string, path: string) => calls.find((c) => c.method === method && c.path.startsWith(path));

describe("collections", () => {
  it("composes a draft and saves it as a note in a notebook", async () => {
    routes[`POST /collections/${CLC}/compose`] = () => ({
      title: "Batteries",
      mode: "report",
      body: "Solid-state cells are safer [1].",
      sources: "## Sources\n1. ChatGPT",
      units: [{ status: "flagged", text: "They cost less.", reasons: ["not in clips"] }],
      checked: true,
    });
    routes[`POST /collections/${CLC}/save`] = () => ({ kind: "note", id: PAG, title: "Batteries", url: `https://app.test/n/${PAG}` });
    const result = await run("collection", "compose", CLC, "--mode", "report", "--save", "--notebook", "Research");
    expect(sent("POST", `/collections/${CLC}/compose`)!.body).toEqual({ mode: "report" });
    expect(sent("POST", `/collections/${CLC}/save`)!.body).toEqual({
      title: "Batteries",
      body: "Solid-state cells are safer [1].",
      sources: "## Sources\n1. ChatGPT",
      mode: "report",
      notebook: "Research",
    });
    expect(result.note.id).toBe(PAG);
    expect(result.flagged).toEqual([{ text: "They cost less.", reasons: ["not in clips"] }]);
  });

  it("refuses an unknown mode, and custom without instructions", async () => {
    let result = await run("collection", "compose", CLC, "--mode", "poem");
    expect(result.error.code).toBe("USAGE");
    out = "";
    result = await run("collection", "compose", CLC, "--mode", "custom");
    expect(result.error.message).toMatch(/--instructions/);
    expect(calls.some((c) => c.path.includes("/compose"))).toBe(false);
  });

  it("orders the named clips first and keeps the rest after them", async () => {
    const clips = CLP.map((id, i) => ({ id, content: `c${i}`, source: null, position: i, createdAt: "" }));
    routes[`GET /collections/${CLC}`] = () => ({ id: CLC, name: "B", clips });
    routes[`POST /collections/${CLC}/order`] = (c) => ({
      id: CLC,
      name: "B",
      clips: (c.body as { ids: string[] }).ids.map((id) => clips.find((x) => x.id === id)),
    });
    await run("collection", "order", CLC, CLP[2]!, CLP[0]!);
    expect(sent("POST", `/collections/${CLC}/order`)!.body).toEqual({ ids: [CLP[2], CLP[0], CLP[1]] });
  });

  it("adds a clip with where it came from", async () => {
    routes[`POST /collections/${CLC}/clips`] = (c) => ({ id: CLP[0], content: (c.body as { content: string }).content, source: null, position: 0, createdAt: "" });
    await run("clip", "add", CLC, "--text", "Hello", "--source-url", "https://example.com/a", "--source-title", "A page");
    expect(sent("POST", `/collections/${CLC}/clips`)!.body).toEqual({
      content: "Hello",
      source: { app: "web", url: "https://example.com/a", title: "A page" },
    });
  });
});

describe("AI", () => {
  it("generate makes a note titled from the first heading, without repeating it", async () => {
    routes["POST /ai/compose"] = () => ({ markdown: "# Backprop\n\nGradients flow back.\n", strategy: "x", kinds: ["quiz"] });
    routes[`POST /workspaces/${WS}/pages`] = (c) => ({ id: PAG, title: (c.body as { title: string }).title, notebookId: null, updatedAt: "" });
    const result = await run("generate", "explain", "backprop");
    expect(sent("POST", "/ai/compose")!.body).toEqual({ request: "explain backprop" });
    expect(sent("POST", `/workspaces/${WS}/pages`)!.body).toEqual({ title: "Backprop", markdown: "Gradients flow back.\n" });
    expect(result).toMatchObject({ id: PAG, url: `https://app.test/n/${PAG}`, blocks: ["quiz"] });
  });

  it("studio create takes exactly one source", async () => {
    const result = await run("studio", "create", "--kind", "quiz", "--text", "abc", "--url", "https://x.test");
    expect(result.error.message).toMatch(/exactly one source/);
    expect(calls.some((c) => c.path === "/studio")).toBe(false);
  });

  it("studio create from a note, waiting until it's made", async () => {
    const row = (status: string) => ({ id: STU, title: "Quiz", kind: "quiz", status, sourceType: "item", sourceLabel: "Note", published: false, createdAt: "", updatedAt: "" });
    routes["POST /studio"] = () => row("running");
    routes[`GET /studio/${STU}`] = () => ({ ...row("succeeded"), spec: { questions: [] } });
    const result = await run("studio", "create", "--kind", "quiz", "--from", PAG, "--wait");
    expect(sent("POST", "/studio")!.body).toEqual({ workspaceId: WS, kind: "quiz", source: { type: "item", id: PAG } });
    expect(result).toMatchObject({ id: STU, status: "succeeded", url: `https://app.test/workspace/studio/${STU}`, spec: { questions: [] } });
  });

  it("video create --note puts the video block in the note", async () => {
    routes["POST /ai/videos"] = () => ({ id: VID, status: "queued", orientation: "portrait", title: null, progress: null, url: null, posterUrl: null, duration: null, error: null });
    routes[`POST /pages/${PAG}/markdown/append`] = () => ({ id: PAG, title: "N", notebookId: null, updatedAt: "" });
    const result = await run("video", "create", "how", "attention", "works", "--portrait", "--note", PAG);
    expect(sent("POST", "/ai/videos")!.body).toEqual({ workspaceId: WS, concept: "how attention works", orientation: "portrait" });
    expect(sent("POST", `/pages/${PAG}/markdown/append`)!.body).toEqual({ markdown: `\`\`\`video\n{"videoId":"${VID}"}\n\`\`\`\n` });
    expect(result.note.id).toBe(PAG);
  });
});

describe("pictures", () => {
  it("saves a canvas as a PNG", async () => {
    routes[`GET /extension/items/${CNV}/image`] = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    const file = join(dir, "c.png");
    const result = await run("canvas", "image", CNV, "-o", file);
    expect(result).toEqual({ kind: "canvas", id: CNV, file });
    expect([...readFileSync(file)]).toEqual([137, 80, 78, 71]);
  });

  it("says how to get a picture when the canvas has none yet", async () => {
    const result = await run("canvas", "image", CNV);
    expect(result.error.code).toBe("NO_IMAGE");
    expect(result.error.hint).toMatch(/open it once/);
  });
});

describe("sharing and activity", () => {
  const share = (email: string, status = "active") => ({ id: `shr_${email}`, role: "viewer", status, user: { name: email, email }, pendingEmail: null });

  it("access lists people, the link setting and publishing", async () => {
    routes[`GET /page/${PAG}/shares`] = () => [share("sam@example.com"), share("old@example.com", "revoked")];
    routes[`GET /page/${PAG}/publish`] = () => ({ published: true, publicUrl: "https://app.test/p/x", publishedVia: null });
    routes[`GET /pages/${PAG}`] = () => ({ id: PAG, sharing: { linkAccess: "anyone_with_link", linkRole: "editor" } });
    const result = await run("access", PAG);
    expect(result).toMatchObject({ link: "edit", published: true, publicUrl: "https://app.test/p/x" });
    expect(result.people.map((p: { email: string }) => p.email)).toEqual(["sam@example.com"]);
  });

  it("unshare removes the person's share by email", async () => {
    routes[`GET /page/${PAG}/shares`] = () => [share("sam@example.com")];
    routes["DELETE /shares/shr_sam@example.com"] = () => new Response(null, { status: 204 });
    await run("unshare", PAG, "--email", "Sam@Example.com");
    expect(sent("DELETE", "/shares/")!.path).toBe("/shares/shr_sam@example.com");
  });

  it("activity names items and says which changes were yours", async () => {
    for (const kind of ["pages", "canvases", "projects", "notebooks", "decks"])
      routes[`GET /workspaces/${WS}/${kind}`] = () => (kind === "pages" ? [{ id: PAG, title: "Plan", updatedAt: "" }] : []);
    routes[`GET /workspaces/${WS}/change-events`] = () => [
      { id: "evt_1", userId: "usr_me", entityType: "page", entityId: PAG, action: "page.update", createdAt: "2026-11-20T10:00:00Z" },
    ];
    const result = await run("activity", "--item", PAG, "--limit", "5");
    expect(sent("GET", `/workspaces/${WS}/change-events`)!.path).toBe(`/workspaces/${WS}/change-events?limit=5&entityId=${PAG}`);
    expect(result).toEqual([{ id: "evt_1", action: "page.update", itemKind: "note", itemId: PAG, title: "Plan", by: "you", at: "2026-11-20T10:00:00Z" }]);
  });
});

describe("presentations", () => {
  const deckRow = (slides: unknown[]) => ({ id: DCK, title: "Talk", notebookId: null, updatedAt: "", document: { version: 1, slides } });
  const slide = (title: string, extra: Record<string, unknown> = {}) => ({
    id: `s_${title}`,
    elements: [{ id: "t", kind: "text", role: "title", x: 0, y: 0, w: 800, h: 80, blocks: [{ id: "h", type: "heading", props: { level: 2 }, content: [{ type: "text", text: title }] }] }],
    animations: [],
    notes: "",
    ...extra,
  });

  it("deck from a note sends the options and returns the link", async () => {
    routes[`POST /workspaces/${WS}/decks/from`] = () => deckRow([slide("Talk"), slide("Idea")]);
    const result = await run("deck", "from", PAG, "--split", "divider", "--keep-text");
    expect(sent("POST", `/workspaces/${WS}/decks/from`)!.body).toEqual({
      source: { kind: "page", id: PAG, split: "divider" },
      textToNotes: false,
      onePerSlide: true,
    });
    expect(result).toMatchObject({ kind: "presentation", id: DCK, url: `https://app.test/d/${DCK}`, slides: 2 });
  });

  it("deck from --ai asks the server to design it, with time to think", async () => {
    routes[`POST /workspaces/${WS}/decks/from`] = () => deckRow([slide("Talk")]);
    await run("deck", "from", PAG, "--ai");
    const call = sent("POST", `/workspaces/${WS}/decks/from`)!;
    expect(call.body).toMatchObject({ source: { kind: "page", id: PAG, split: "heading" }, design: "ai" });
    expect(call.timeout).toBe(true);
  });

  it("deck from refuses a canvas and an unknown split", async () => {
    let result = await run("deck", "from", CNV);
    expect(result.error.message).toMatch(/note, project or notebook/);
    out = "";
    result = await run("deck", "from", PAG, "--split", "paragraph");
    expect(result.error.code).toBe("USAGE");
    expect(calls.some((c) => c.path.includes("/decks"))).toBe(false);
  });

  it("deck create sends slide markdown", async () => {
    const file = join(dir, "talk.md");
    writeFileSync(file, "# Talk\n???\nHi\n---\n## Idea");
    routes[`POST /workspaces/${WS}/decks`] = () => deckRow([slide("Talk"), slide("Idea")]);
    await run("deck", "create", "Talk", "--file", file);
    expect(sent("POST", `/workspaces/${WS}/decks`)!.body).toEqual({ title: "Talk", markdown: "# Talk\n???\nHi\n---\n## Idea" });
  });

  it("deck show prints an outline agents can read", async () => {
    const quiz = { id: "q", kind: "block", x: 500, y: 0, w: 400, h: 300, blocks: [{ id: "b", type: "interactive", props: { kind: "quiz" } }] };
    routes[`GET /decks/${DCK}`] = () =>
      deckRow([
        slide("Check", { elements: [slide("Check").elements[0], quiz], animations: [{ trigger: "click" }, { trigger: "with" }], notes: "Ask first" }),
        slide("Diagram", { elements: [{ id: "c", kind: "canvas", canvasId: CNV, itemId: null, x: 0, y: 0, w: 960, h: 540 }, slide("Diagram").elements[0]], hidden: true }),
      ]);
    const result = await run("deck", "show", DCK);
    expect(result.slides).toEqual([
      { n: 1, title: "Check", objects: ["text", "quiz"], clicks: 1, notes: "Ask first" },
      { n: 2, title: "Diagram", objects: ["canvas", "text"], canvas: CNV, hidden: true, notes: "" },
    ]);
  });

  it("presentations are listed inside notebooks and renamed by title", async () => {
    routes["GET /workspaces/" + WS + "/notebooks"] = () => [{ id: NTB, name: "Course", updatedAt: "" }];
    routes[`GET /notebooks/${NTB}`] = () => ({ notebook: { id: NTB, name: "Course" }, notes: [], canvases: [], projects: [], decks: [{ id: DCK, title: "Week 1", updatedAt: "" }] });
    const list = await run("list", "--notebook", NTB, "--kind", "presentation");
    expect(list.map((i: { kind: string; id: string }) => [i.kind, i.id])).toEqual([["presentation", DCK]]);
    out = "";
    routes[`PATCH /decks/${DCK}`] = (c) => ({ id: DCK, title: (c.body as { title: string }).title, updatedAt: "" });
    await run("rename", DCK, "Week one");
    expect(sent("PATCH", `/decks/${DCK}`)!.body).toEqual({ title: "Week one" });
  });
});
