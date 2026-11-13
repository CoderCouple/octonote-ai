/**
 * Reading notes, canvases and projects from the browser extension: asked for
 * at connect (`read: true` → a "clipper_read" token), then listing, fetching
 * an item as Markdown (canvases as Mermaid) and its canvas picture.
 */
import { randomBytes } from "node:crypto";
import type { ExecutionContext } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExtensionConnectController } from "../../src/api/v1/controller/extension-connect.controller";
import { ExtensionItemsController } from "../../src/api/v1/controller/extension-items.controller";
import { cliTokenScopeAllows } from "../../src/auth/cli-token-scope";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../src/auth/supabase-auth.guard";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import * as schema from "../../src/db/schema";
import { CliTokensService } from "../../src/service/cli-tokens.service";
import { challengeFor, ExtensionConnectService } from "../../src/service/extension-connect.service";
import {
  ExtensionItemsService,
  ITEM_MAX_CHARS,
  thumbnailFetchUrl,
  TRUNCATED_NOTE,
} from "../../src/service/extension-items.service";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { createHarness, statusOf, type Harness } from "./harness";

const SUPABASE = "https://abc.supabase.co";
const BUCKET_URL = `${SUPABASE}/storage/v1/object/public/canvas-thumbnails`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest-of-png")]);

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let tools: McpToolsService;
let controller: ExtensionConnectController;
let items: ExtensionItemsService;
let itemsController: ExtensionItemsController;
let guard: SupabaseAuthGuard;
let fetched: string[];
let savedSupabaseUrl: string | undefined;

beforeEach(async () => {
  savedSupabaseUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = SUPABASE;
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  const members = new WorkspaceMembersRepository(h.db);
  controller = new ExtensionConnectController(new ExtensionConnectService(h.db, members, h.cliTokens));
  tools = new McpToolsService(
    members,
    h.pages,
    h.canvases,
    h.projects,
    h.notebooks,
    h.noteMarkdown,
    h.canvasDiagrams,
    h.settings,
    h.shares,
    h.figures,
  );
  items = new ExtensionItemsService(tools, h.notebooks, h.noteMarkdown, h.canvases, h.projects);
  fetched = [];
  items.fetcher = async (url) => {
    fetched.push(url);
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  };
  itemsController = new ExtensionItemsController(items);
  const moduleRef = {
    get: (cls: unknown) => {
      if (cls === CliTokensService) return h.cliTokens;
      throw new Error("not registered");
    },
  } as unknown as ModuleRef;
  guard = new SupabaseAuthGuard({} as never, moduleRef);
});

afterEach(() => {
  if (savedSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = savedSupabaseUrl;
});

const webReq = (userId: string) => ({ user: { id: userId }, headers: {} }) as unknown as AuthenticatedRequest;

async function connect(read?: boolean) {
  const verifier = randomBytes(32).toString("base64url");
  const body = { workspaceId: alice.workspaceId, challenge: challengeFor(verifier), ...(read === undefined ? {} : { read }) };
  const { code } = await controller.createCode(body, webReq(alice.id));
  return controller.exchange({ code, verifier }, { headers: {}, ip: `9.9.9.${Math.random()}` } as never);
}

async function asToken(token: string, method: string, url: string) {
  const req = { headers: { authorization: `Bearer ${token}` }, method, url } as unknown as AuthenticatedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return statusOf(guard.canActivate(ctx));
}

const ITEM_ROUTES = [
  ["GET", "/extension/items?workspaceId=wsp_1&q=plan&limit=5"],
  ["GET", "/extension/items/pag_1"],
  ["GET", "/extension/items/cnv_1/image"],
] as const;

const TWO_BOXES = "flowchart TD\n  A[Collect data] -->|cleaned| B[Train model]";

async function setThumbnail(canvasId: string, url: string) {
  await h.db.update(schema.canvases).set({ thumbnailUrl: url }).where(eq(schema.canvases.id, canvasId));
}

describe("asking for read access at connect", () => {
  it("gives a clipper_read token when the page sent read: true", async () => {
    const result = await connect(true);
    expect(result.scope).toBe("clipper_read");
    const [row] = await h.db.query.cliTokens.findMany();
    expect(row).toMatchObject({ name: "Browser extension", scope: "clipper_read" });
  });

  it("stays a plain clipper token otherwise", async () => {
    expect((await connect()).scope).toBe("clipper");
    expect((await connect(false)).scope).toBe("clipper");
    const scopes = (await h.db.query.cliTokens.findMany()).map((r) => r.scope);
    expect(scopes).toEqual(["clipper", "clipper"]);
  });
});

describe("who may call the item routes", () => {
  it("refuses a clipper token with the clipper message", async () => {
    const { token } = await connect(false);
    for (const [m, u] of ITEM_ROUTES) expect([m, u, await asToken(token, m, u)]).toEqual([m, u, 403]);
    let message = "";
    try {
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` }, method: "GET", url: "/extension/items/pag_1" }) }),
      } as unknown as ExecutionContext);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe("This token can only add clips to collections.");
  });

  it("lets a clipper_read token through, and still keeps it to collections and items", async () => {
    const { token } = await connect(true);
    for (const [m, u] of ITEM_ROUTES) expect([m, u, await asToken(token, m, u)]).toEqual([m, u, 200]);
    expect(await asToken(token, "POST", "/collections/clc_1/clips")).toBe(200);
    for (const [m, u] of [
      ["GET", "/pages/pag_1"],
      ["PATCH", "/extension/items/pag_1"],
      ["POST", "/extension/items/pag_1/summary"],
      ["GET", "/extension/items/pag_1/image/x"],
      ["POST", "/extension/connect-codes"],
      ["POST", "/collections/clc_1/compose"],
      ["GET", "/me/cli-tokens"],
    ] as const) {
      expect([m, u, await asToken(token, m, u)]).toEqual([m, u, 403]);
    }
  });

  it("lets full tokens through", async () => {
    const { plaintext } = await h.cliTokens.create(alice.id, { name: "Laptop" });
    for (const [m, u] of ITEM_ROUTES) expect(await asToken(plaintext, m, u)).toBe(200);
  });

  it("matches the allowlist exactly", () => {
    for (const [m, u] of ITEM_ROUTES) {
      expect(cliTokenScopeAllows("clipper", m, u)).toBe(false);
      expect(cliTokenScopeAllows("clipper_read", m, u)).toBe(true);
    }
    expect(cliTokenScopeAllows("clipper_read", "GET", "/collections")).toBe(true);
    expect(cliTokenScopeAllows("clipper_read", "DELETE", "/me/cli-tokens/current")).toBe(true);
    expect(cliTokenScopeAllows("clipper_read", "DELETE", "/collections/clc_1")).toBe(false);
    expect(cliTokenScopeAllows("clipper_read", "POST", "/extension/items")).toBe(false);
    expect(cliTokenScopeAllows("toString" as never, "GET", "/collections")).toBe(false);
  });
});

describe("listing items", () => {
  it("shows the caller's notes, canvases and projects, newest first, with notebook names", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Research" }, alice.id);
    await tools.createNote(alice.id, { title: "Osmosis", markdown: "Water moves across membranes.", notebook: nb.id });
    await tools.createCanvas(alice.id, { title: "Pipeline", mermaid: TWO_BOXES });
    await tools.createProject(alice.id, { title: "Thesis plan", noteMarkdown: "# Plan" });
    await tools.createNote(bob.id, { title: "Bob's secret" });

    const list = await itemsController.list({ workspaceId: alice.workspaceId, limit: 20 }, webReq(alice.id));
    expect(list.map((i) => [i.kind, i.title]).sort()).toEqual([
      ["canvas", "Pipeline"],
      ["note", "Osmosis"],
      ["project", "Thesis plan"],
    ]);
    const sorted = [...list].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    expect(list).toEqual(sorted);
    expect(list.find((i) => i.title === "Osmosis")).toMatchObject({ notebook: "Research" });
    expect(list.find((i) => i.title === "Pipeline")).toMatchObject({ notebook: null });
    for (const i of list) {
      expect(Object.keys(i).sort()).toEqual(["id", "kind", "notebook", "title", "updatedAt"]);
      expect(typeof i.updatedAt).toBe("string");
    }

    expect(await items.list(alice.id, { workspaceId: alice.workspaceId, limit: 2 })).toHaveLength(2);
  });

  it("searches titles and note text", async () => {
    await tools.createNote(alice.id, { title: "Biology", markdown: "Osmosis is the movement of water." });
    await tools.createNote(alice.id, { title: "Osmosis basics" });
    await tools.createNote(alice.id, { title: "Shopping" });
    await tools.createNote(bob.id, { title: "Osmosis (Bob)" });
    const found = await items.list(alice.id, { workspaceId: alice.workspaceId, q: "osmosis" });
    expect(found.map((i) => i.title)).toEqual(["Osmosis basics", "Biology"]);
  });

  it("refuses someone else's workspace", async () => {
    await tools.createNote(bob.id, { title: "Bob's secret" });
    expect(await statusOf(items.list(alice.id, { workspaceId: bob.workspaceId }))).toBe(404);
  });
});

describe("fetching an item", () => {
  it("returns a note as Markdown with its app link", async () => {
    const note = await tools.createNote(alice.id, { title: "Osmosis", markdown: "# Osmosis\n\nWater **moves**." });
    const item = await itemsController.get(note.id, webReq(alice.id));
    expect(item).toEqual({
      id: note.id,
      kind: "note",
      title: "Osmosis",
      url: note.url,
      markdown: expect.stringContaining("Water **moves**."),
      chars: item.markdown.length,
      hasImage: false,
    });
    expect(item.url).toMatch(new RegExp(`/n/${note.id}$`));
  });

  it("returns a canvas as a Mermaid flowchart", async () => {
    const canvas = await tools.createCanvas(alice.id, { title: "Pipeline", mermaid: TWO_BOXES });
    const item = await items.get(alice.id, canvas.id);
    expect(item.kind).toBe("canvas");
    expect(item.url).toMatch(new RegExp(`/c/${canvas.id}$`));
    expect(item.markdown).toMatch(/^```mermaid\nflowchart TD\n/);
    expect(item.markdown).toMatch(/```$/);
    expect(item.markdown).toContain('["Collect data"]');
    expect(item.markdown).toContain('["Train model"]');
    expect(item.markdown).toMatch(/n\d -->\|"cleaned"\| n\d/);
    expect(item.hasImage).toBe(false);

    await setThumbnail(canvas.id, `${BUCKET_URL}/${canvas.id}/thumb-1.png`);
    expect((await items.get(alice.id, canvas.id)).hasImage).toBe(true);
  });

  it("returns a project's note followed by its canvas", async () => {
    const project = await tools.createProject(alice.id, { title: "Thesis", noteMarkdown: "Intro paragraph.", canvasMermaid: TWO_BOXES });
    const item = await items.get(alice.id, project.id);
    expect(item.kind).toBe("project");
    expect(item.url).toMatch(new RegExp(`/p/${project.id}$`));
    expect(item.markdown).toMatch(/^Intro paragraph\.\n\n## Canvas\n\n```mermaid\nflowchart TD\n/);
    expect(item.markdown).toContain('"cleaned"');
    expect(item.hasImage).toBe(false);
    await setThumbnail(project.canvasId!, `${BUCKET_URL}/${project.canvasId}/thumb-1.png`);
    expect((await items.get(alice.id, project.id)).hasImage).toBe(true);
  });

  it("cuts very long notes at 500,000 characters with a note", async () => {
    const note = await tools.createNote(alice.id, { title: "Huge", markdown: "word ".repeat(120_000) });
    const item = await items.get(alice.id, note.id);
    expect(item.chars).toBe(ITEM_MAX_CHARS);
    expect(item.markdown.length).toBe(ITEM_MAX_CHARS);
    expect(item.markdown.endsWith(TRUNCATED_NOTE)).toBe(true);
  });

  it("is a 404 for someone else's items, notebooks and nonsense ids", async () => {
    const note = await tools.createNote(bob.id, { title: "Bob's secret" });
    const canvas = await tools.createCanvas(bob.id, { title: "Bob's map", mermaid: TWO_BOXES });
    const project = await tools.createProject(bob.id, { title: "Bob's project" });
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Mine" }, alice.id);
    for (const id of [note.id, canvas.id, project.id, nb.id, "nonsense", "pag_missing"]) {
      expect([id, await statusOf(items.get(alice.id, id))]).toEqual([id, 404]);
    }
    expect(await statusOf(items.image(alice.id, canvas.id))).toBe(404);
  });
});

describe("the canvas picture", () => {
  it("streams the thumbnail from our storage bucket", async () => {
    const canvas = await tools.createCanvas(alice.id, { title: "Pipeline", mermaid: TWO_BOXES });
    await setThumbnail(canvas.id, `${BUCKET_URL}/${canvas.id}/thumb-1.png?x=1`);
    const bytes = await items.image(alice.id, canvas.id);
    expect(bytes.equals(PNG)).toBe(true);
    expect(fetched).toEqual([`${BUCKET_URL}/${canvas.id}/thumb-1.png`]);

    const sent: { type?: string; body?: unknown; headers: Record<string, string> } = { headers: {} };
    const reply = {
      header(k: string, v: string) {
        sent.headers[k] = v;
        return reply;
      },
      type(t: string) {
        sent.type = t;
        return reply;
      },
      send(b: unknown) {
        sent.body = b;
        return reply;
      },
    };
    await itemsController.image(canvas.id, webReq(alice.id), reply as never);
    expect(sent.type).toBe("image/png");
    expect((sent.body as Buffer).equals(PNG)).toBe(true);
  });

  it("uses a project's canvas picture", async () => {
    const project = await tools.createProject(alice.id, { title: "Thesis" });
    expect(await statusOf(items.image(alice.id, project.id))).toBe(404);
    await setThumbnail(project.canvasId!, `${BUCKET_URL}/${project.canvasId}/thumb-1.png`);
    expect((await items.image(alice.id, project.id)).equals(PNG)).toBe(true);
  });

  it("refuses to fetch a thumbnail URL outside the storage bucket", async () => {
    const canvas = await tools.createCanvas(alice.id, { title: "Pipeline" });
    for (const url of [
      "https://evil.example.com/storage/v1/object/public/canvas-thumbnails/x.png",
      `${SUPABASE}/storage/v1/object/public/other-bucket/x.png`,
      `${SUPABASE}/storage/v1/object/sign/canvas-thumbnails/x.png`,
      `${SUPABASE}/storage/v1/object/public/canvas-thumbnails/../../../auth/v1/admin`,
      `${SUPABASE}/storage/v1/object/public/canvas-thumbnails/%2e%2e/secret`,
      `https://user:pw@abc.supabase.co/storage/v1/object/public/canvas-thumbnails/x.png`,
      `${SUPABASE}:8443/storage/v1/object/public/canvas-thumbnails/x.png`,
      "http://169.254.169.254/latest/meta-data",
    ]) {
      await setThumbnail(canvas.id, url);
      expect([url, await statusOf(items.image(alice.id, canvas.id))]).toEqual([url, 404]);
    }
    expect(fetched).toEqual([]);
    expect(await statusOf(items.image(alice.id, (await tools.createNote(alice.id, { title: "N" })).id))).toBe(404);
  });

  it("refuses oversized or non-PNG responses", async () => {
    const canvas = await tools.createCanvas(alice.id, { title: "Pipeline" });
    await setThumbnail(canvas.id, `${BUCKET_URL}/${canvas.id}/thumb-1.png`);
    items.fetcher = async () => new Response(Buffer.alloc(3 * 1024 * 1024 + 1, 1), { status: 200 });
    expect(await statusOf(items.image(alice.id, canvas.id))).toBe(502);
    items.fetcher = async () => new Response("<html>", { status: 200 });
    expect(await statusOf(items.image(alice.id, canvas.id))).toBe(502);
    items.fetcher = async () => new Response("gone", { status: 404 });
    expect(await statusOf(items.image(alice.id, canvas.id))).toBe(404);
  });

  it("only accepts the configured bucket (unit)", () => {
    expect(thumbnailFetchUrl(`${BUCKET_URL}/a/b.png`, SUPABASE)).toBe(`${BUCKET_URL}/a/b.png`);
    expect(thumbnailFetchUrl(`${BUCKET_URL}/a/b.png`, undefined)).toBeNull();
    expect(thumbnailFetchUrl(`${BUCKET_URL}/`, SUPABASE)).toBeNull();
    expect(thumbnailFetchUrl("not a url", SUPABASE)).toBeNull();
  });
});

describe("rate limits", () => {
  it("limits item fetches per person", async () => {
    const note = await tools.createNote(alice.id, { title: "N" });
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push(await statusOf(items.get(alice.id, note.id)));
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect(await statusOf(items.get(bob.id, (await tools.createNote(bob.id, { title: "B" })).id))).toBe(200);
  });
});
