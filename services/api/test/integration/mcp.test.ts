/**
 * The MCP server end to end: a real MCP SDK client talks Streamable HTTP to
 * the controller (served by Fastify on a random port) with an OAuth token
 * from the real flow, against real Postgres. Checks sign-in is required,
 * tools act as the signed-in person only, and errors come back readable.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpController } from "../../src/api/v1/controller/mcp.controller";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { mcpResource } from "../../src/service/oauth.service";
import { createHarness, type Harness } from "./harness";

let h: Harness;
let app: FastifyInstance;
let base: string;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  const tools = new McpToolsService(
    new WorkspaceMembersRepository(h.db),
    h.pages,
    h.canvases,
    h.projects,
    h.notebooks,
    h.noteMarkdown,
    h.canvasDiagrams,
    h.settings,
    h.shares,
  );
  const controller = new McpController(h.oauth, tools, h.activity, h.noteComments);
  app = Fastify();
  app.all("/mcp", (req, reply) => controller.handle(req, reply));
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
  process.env.PUBLIC_API_URL = base;
});

afterEach(async () => {
  delete process.env.PUBLIC_API_URL;
  await app.close();
});

/** The full OAuth flow for `userId`, returning an access token for /mcp. */
async function tokenFor(userId: string) {
  const client = await h.oauth.register({ client_name: "Test", redirect_uris: ["https://client.test/cb"] });
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const started = await h.oauth.authorize(base, {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "https://client.test/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: mcpResource(base),
  });
  const requestId = new URL((started as { redirect: string }).redirect).searchParams.get("request")!;
  const code = new URL((await h.oauth.approve(base, requestId, userId)).redirect).searchParams.get("code")!;
  const tokens = await h.oauth.token(base, { grant_type: "authorization_code", code, code_verifier: verifier });
  return tokens.access_token;
}

async function connect(token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }),
  );
  return client;
}

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { ...r, json: JSON.parse(r.content[0]!.text) };
};

describe("mcp card view", () => {
  it("compiles in a browser (escapes inside the template string survive)", async () => {
    const { previewHtml } = await import("../../src/mcp/preview-view");
    const html = previewHtml();
    const script = html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"));
    // Parse only: throws a SyntaxError if an escape turned into a raw newline.
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("mcp server", () => {
  it("requires a token and says where to sign in (RFC 9728)", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);

    const bad = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: "Bearer ona_nope" }, body: "{}" });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("lists the tools with read-only and destructive hints", async () => {
    const client = await connect(await tokenFor(alice.id));
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const name of ["search", "fetch", "list_items", "create_note", "update_note", "create_canvas", "redraw_canvas", "create_project", "create_notebook", "rename", "move", "publish", "share", "set_link_access", "delete"]) {
      expect(byName[name], name).toBeTruthy();
    }
    // Every tool states all three hints and a title (directory reviews check them).
    for (const t of tools) {
      expect(t.annotations, t.name).toMatchObject({
        title: expect.any(String),
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
    expect(byName.search!.annotations?.readOnlyHint).toBe(true);
    expect(byName.publish!.annotations?.openWorldHint).toBe(true);
    expect(byName.update_note!.annotations?.destructiveHint).toBe(true);
    expect(byName.delete!.annotations?.destructiveHint).toBe(true);
    expect(byName.create_note!.annotations?.destructiveHint).toBe(false);
    await client.close();
  });

  it("writes and reads notes, canvases and notebooks as the signed-in person", async () => {
    const client = await connect(await tokenFor(alice.id));
    const nb = (await call(client, "create_notebook", { name: "Research" })).json;
    const note = (await call(client, "create_note", { title: "Caching plan", markdown: "# Caching\n\nUse **Redis**.", notebook: "Research" })).json;
    expect(note.url).toContain(`/n/${note.id}`);
    await call(client, "update_note", { id: note.id, markdown: "- add TTLs", mode: "append" });

    const fetched = (await call(client, "fetch", { id: note.id })).json;
    expect(fetched.text).toContain("Redis");
    expect(fetched.text).toContain("add TTLs");

    const canvas = (await call(client, "create_canvas", { title: "Classes", mermaid: "classDiagram\n  Cache <|-- Redis\n  click Redis href \"https://example.com/redis\"" })).json;
    expect(canvas.id).toMatch(/^cnv_/);

    const found = (await call(client, "search", { query: "caching" })).json;
    expect(found.results.map((r: { id: string }) => r.id)).toContain(note.id);
    const inNb = (await call(client, "list_items", { notebook: nb.id })).json;
    expect(inNb.map((i: { id: string }) => i.id)).toEqual([note.id]);
    await client.close();
  });

  it("can't touch someone else's items, and errors are readable", async () => {
    const aliceNote = await h.noteMarkdown.create(await firstWorkspace(alice.id), { title: "Private", markdown: "secret" }, alice.id);
    const client = await connect(await tokenFor(bob.id));
    const r = await call(client, "fetch", { id: aliceNote.id });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain("secret");

    const badMermaid = await call(client, "create_canvas", { title: "x", mermaid: "sequenceDiagram\n A->>B: hi" });
    expect(badMermaid.isError).toBe(true);
    expect(badMermaid.json.message).toMatch(/can become canvases/);
    await client.close();
  });

  it("serves the inline card (MCP Apps) and fills it from tool results", async () => {
    const client = await connect(await tokenFor(alice.id));
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect((byName.create_note!._meta as { ui?: { resourceUri?: string } }).ui?.resourceUri).toBe("ui://octonote/preview");
    expect((byName.create_note!._meta as Record<string, unknown>)["ui/resourceUri"]).toBe("ui://octonote/preview");
    expect(byName.search!._meta?.ui).toBeUndefined();

    const { resources } = await client.listResources();
    expect(resources.find((r) => r.uri === "ui://octonote/preview")?.mimeType).toBe("text/html;profile=mcp-app");
    const read = await client.readResource({ uri: "ui://octonote/preview" });
    const page = read.contents[0] as { text: string; mimeType: string; _meta?: { ui?: { csp?: { resourceDomains?: string[] } } } };
    expect(page.mimeType).toBe("text/html;profile=mcp-app");
    expect(page.text).toContain("ui/initialize");
    expect(page.text).toContain("appInfo"); // the ext-apps schema requires appInfo, not clientInfo
    expect(page._meta?.ui?.csp?.resourceDomains).toContain("https://cdn.jsdelivr.net");

    const r = (await client.callTool({
      name: "create_note",
      arguments: { title: "Card test", markdown: "# Card test\n\n- [ ] first step\n\n```mermaid\ngraph LR\n  A-->B\n```" },
    })) as { content: { text: string }[]; structuredContent?: { preview?: Record<string, unknown> } };
    const preview = r.structuredContent!.preview!;
    expect(preview).toMatchObject({ kind: "note", title: "Card test", publicUrl: null });
    expect(String(preview.html)).toContain("first step");
    expect(String(preview.html)).toContain("mermaid");
    // The model gets the short JSON result, not the card's HTML.
    expect(r.content[0]!.text).not.toContain("<h1");
    await client.close();
  });

  it("runs the card's comment loop: the card saves, the assistant reads and applies", async () => {
    const client = await connect(await tokenFor(alice.id));
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    // Card-only tools are hidden from the model (MCP Apps + ChatGPT's own key).
    for (const name of ["note_comment_create", "note_comment_status", "note_comment_retry", "note_comment_cancel"]) {
      const meta = byName[name]!._meta as Record<string, unknown> & { ui?: { visibility?: string[] } };
      expect(meta.ui?.visibility, name).toEqual(["app"]);
      expect(meta["openai/visibility"], name).toBeUndefined();
      expect(meta["openai/widgetAccessible"], name).toBe(true);
    }
    // The assistant's tools stay visible (no visibility = model and app).
    for (const name of ["note_comment_get", "note_comment_apply", "note_comment_decline"]) {
      expect((byName[name]!._meta as { ui?: unknown } | undefined)?.ui, name).toBeUndefined();
    }

    const made = (await client.callTool({ name: "create_note", arguments: { title: "Pitch", markdown: "Intro line.\n\nPrice is ten." } })) as unknown as {
      structuredContent: { preview: { noteId: string; html: string; canComment: boolean; version: string } };
    };
    const preview = made.structuredContent.preview;
    expect(preview.canComment).toBe(true);
    const anchor = /data-b="([^"]+)"><p>Price/.exec(preview.html)![1]!;

    const created = (await client.callTool({
      name: "note_comment_create",
      arguments: { noteId: preview.noteId, comments: [{ anchors: [anchor], quote: "ten", body: "Make it twelve" }] },
    })) as unknown as { structuredContent: { comments: { id: string; status: string }[] } };
    const id = created.structuredContent.comments[0]!.id;
    expect(id).toMatch(/^cmt_/);

    const got = (await call(client, "note_comment_get", { ids: [id] })).json;
    expect(got.comments[0]).toMatchObject({ id, request: "Make it twelve", markdown: "Price is ten." });
    expect((await call(client, "note_comment_apply", { id, markdown: "Price is twelve." })).json.comment.status).toBe("done");

    const status = (await client.callTool({
      name: "note_comment_status",
      arguments: { noteId: preview.noteId, ids: [id], since: preview.version },
    })) as unknown as { structuredContent: { comments: { status: string }[]; html?: string } };
    expect(status.structuredContent.comments[0]!.status).toBe("done");
    expect(status.structuredContent.html).toContain("Price is twelve.");
    expect(status.structuredContent.html).toContain("Intro line.");
    await client.close();
  });

  it("publishes only on request and returns the public link", async () => {
    const client = await connect(await tokenFor(alice.id));
    const note = (await call(client, "create_note", { title: "Launch post", markdown: "Hello" })).json;
    const pub = (await call(client, "publish", { id: note.id })).json;
    expect(pub.published).toBe(true);
    expect(pub.publicUrl).toContain("/pub/");
    const unpub = (await call(client, "publish", { id: note.id, published: false })).json;
    expect(unpub.publicUrl).toBeNull();
    await client.close();
  });
});

async function firstWorkspace(userId: string) {
  const rows = await new WorkspaceMembersRepository(h.db).listForUser(userId);
  return rows[0]!.workspaceId;
}
