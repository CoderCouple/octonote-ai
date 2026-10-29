/** Remote MCP server (POST /mcp): the real OAuth flow (DCR + PKCE + consent approve), then the canvas tools. */
import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { API, cleanup, devClient, expectOctodraw, itemsOf, rfetch, tag, type Client } from "./_support";

let c: Client;
let access: string;
let refresh: string;
const REDIRECT = "http://localhost:53682/callback";
const made: { kind: "canvas" | "project"; id: string }[] = [];

const b64url = (b: Buffer) => b.toString("base64url");

async function oauthToken(): Promise<{ access_token: string; refresh_token: string; clientId: string }> {
  const reg = await rfetch(`${API}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: `E2E MCP ${tag()}`, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
  });
  expect(reg.status).toBe(201);
  const client = (await reg.json()) as { client_id: string };

  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = tag();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "octonote",
    resource: `${API}/mcp`,
  });
  const auth = await rfetch(`${API}/oauth/authorize?${q}`, { redirect: "manual" });
  expect(auth.status).toBe(302);
  const consent = new URL(auth.headers.get("location")!);
  expect(consent.pathname).toBe("/connect/authorize");
  const requestId = consent.searchParams.get("request")!;

  const desc = await c.call("GET", `/oauth/requests/${requestId}`);
  expect(desc.status).toBe(200);
  expect(JSON.stringify(desc.body)).not.toMatch(/"code"\s*:/);

  const approved = await c.ok<{ redirect: string }>("POST", `/oauth/requests/${requestId}/approve`);
  const back = new URL(approved.redirect);
  expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
  expect(back.searchParams.get("state")).toBe(state);
  const code = back.searchParams.get("code")!;
  expect(code).toBeTruthy();

  // Wrong verifier is refused (and doesn't burn the code).
  const wrong = await rfetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: b64url(randomBytes(48)), client_id: client.client_id, redirect_uri: REDIRECT }),
  });
  expect(wrong.status).toBe(400);

  const tok = await rfetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT, resource: `${API}/mcp` }),
  });
  expect(tok.status).toBe(200);
  const t = (await tok.json()) as { access_token: string; refresh_token: string; token_type: string };
  expect(t.token_type).toBe("Bearer");

  // The code is single-use.
  const again = await rfetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier }),
  });
  expect(again.status).toBe(400);
  return { ...t, clientId: client.client_id };
}

let rpcId = 0;
async function mcp(method: string, params: Record<string, unknown> = {}, token: string | null = access) {
  const r = await rfetch(`${API}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const data = text.split("\n").find((l) => l.startsWith("data:"));
    body = data ? JSON.parse(data.slice(5)) : text;
  }
  return { status: r.status, headers: r.headers, body };
}
async function tool(name: string, args: Record<string, unknown>) {
  const r = await mcp("tools/call", { name, arguments: args });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  expect(r.body.error, JSON.stringify(r.body.error)).toBeUndefined();
  return r.body.result as { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: any };
}
const parsed = (res: { content: { text: string }[] }) => JSON.parse(res.content[0]!.text);

test.beforeAll(async () => {
  c = await devClient();
  const t = await oauthToken();
  access = t.access_token;
  refresh = t.refresh_token;
});
test.afterAll(async () => {
  await cleanup(c, made);
  // Disconnect every app these specs connected.
  const apps = await c.ok<any[]>("GET", "/me/connected-apps");
  for (const a of apps) if (/^E2E MCP/.test(a.clientName ?? a.name ?? "")) await c.call("DELETE", `/me/connected-apps/${a.id}`);
});

test("unauthenticated and bad-token calls get 401 with resource_metadata", async () => {
  const anon = await mcp("tools/list", {}, null);
  expect(anon.status).toBe(401);
  const www = anon.headers.get("www-authenticate") ?? "";
  expect(www).toMatch(/^Bearer /);
  expect(www).toContain(`resource_metadata="${API}/.well-known/oauth-protected-resource/mcp"`);
  const meta = await (await rfetch(`${API}/.well-known/oauth-protected-resource/mcp`)).json();
  expect(meta.resource).toBe(`${API}/mcp`);

  const bad = await mcp("tools/list", {}, "not-a-token");
  expect(bad.status).toBe(401);
  expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');

  // A Supabase web session isn't an MCP token.
  expect((await mcp("tools/list", {}, c.token)).status).toBe(401);
});

test("refresh_token grant issues a working access token", async () => {
  const r = await rfetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  expect(r.status).toBe(200);
  const t = await r.json();
  expect((await mcp("tools/list", {}, t.access_token)).status).toBe(200);
  refresh = t.refresh_token ?? refresh;
});

test("initialize + tools/list: canvas tools with all three annotations", async () => {
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  expect(init.status).toBe(200);
  expect(init.body.result.serverInfo.name).toBeTruthy();
  expect(init.body.result.capabilities.tools).toBeTruthy();
  expect(init.body.result.instructions).toMatch(/mermaid/);

  const list = await mcp("tools/list");
  expect(list.status).toBe(200);
  const tools = list.body.result.tools as any[];
  const names = tools.map((t) => t.name);
  for (const n of ["search", "fetch", "list_items", "create_canvas", "redraw_canvas", "create_project", "publish", "delete"]) expect(names).toContain(n);
  for (const t of tools) {
    for (const k of ["readOnlyHint", "destructiveHint", "openWorldHint"]) expect(typeof t.annotations?.[k], `${t.name}.${k}`).toBe("boolean");
    expect(t.annotations.title).toBeTruthy();
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  expect(byName.create_canvas.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  expect(byName.redraw_canvas.annotations.destructiveHint).toBe(true);
  expect(byName.fetch.annotations.readOnlyHint).toBe(true);
  expect(byName.publish.annotations.openWorldHint).toBe(true);
  expect(byName.create_canvas.inputSchema.properties.mermaid).toBeTruthy();
  expect(byName.create_canvas._meta?.ui?.resourceUri).toBe("ui://octonote/preview");
});

test("create_canvas (mermaid) → fetch with outline (bend/dashed) → redraw_canvas", async () => {
  const title = `E2E mcp canvas ${tag()}`;
  const created = await tool("create_canvas", { title, mermaid: "flowchart LR\n  A[Ask] -->|why| B{Think}\n  B -.-> C[Answer]" });
  expect(created.isError).toBeFalsy();
  const ref = parsed(created);
  made.push({ kind: "canvas", id: ref.id });
  expect(ref.id).toMatch(/^cnv_/);
  expect(ref.url).toContain(ref.id);
  const outline0 = created.structuredContent?.preview?.outline;
  expect(outline0.shapes.map((s: any) => s.label).sort()).toEqual(["Answer", "Ask", "Think"]);
  expect(outline0.arrows.some((a: any) => a.dash === "dashed")).toBe(true);

  const row = await c.ok("GET", `/canvases/${ref.id}`);
  expectOctodraw(row.document);
  expect(itemsOf(row.document, "line")).toHaveLength(2);

  // Bent + dashed lines carry into the outline.
  const doc = {
    version: 1,
    items: [
      { id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 100, h: 60, text: "Left", link: "https://octonote.ai" },
      { id: "b", type: "shape", shape: "ellipse", x: 300, y: 0, w: 100, h: 60, text: "Right", dashed: true, fill: "solid" },
      { id: "l", type: "line", x: 0, y: 0, w: 0, h: 0, start: { x: 0, y: 0, item: "a" }, end: { x: 0, y: 0, item: "b" }, endArrow: true, dashed: true, bend: 40, text: "curve" },
    ],
  };
  await c.ok("PATCH", `/canvases/${ref.id}`, { document: doc });
  const fetched = await tool("fetch", { id: ref.id });
  expect(parsed(fetched)).toMatchObject({ id: ref.id, title, metadata: { kind: "canvas" } });
  const outline = fetched.structuredContent.preview.outline;
  expect(outline.shapes.map((s: any) => s.label).sort()).toEqual(["Left", "Right"]);
  expect(outline.shapes.find((s: any) => s.label === "Left").url).toBe("https://octonote.ai");
  expect(outline.shapes.find((s: any) => s.label === "Right").dash).toBe("dashed");
  expect(outline.arrows).toHaveLength(1);
  const [arrow] = outline.arrows;
  expect(arrow).toMatchObject({ bend: 40, dash: "dashed", label: "curve" });
  // Ends clipped to the outlines, not at the centres.
  expect(arrow.x1).toBeGreaterThan(50);
  expect(arrow.x2).toBeLessThan(350);

  const redrawn = await tool("redraw_canvas", { id: ref.id, mermaid: "graph TD\n  X[New] --> Y[Shape]", title: `${title} v2` });
  expect(redrawn.isError).toBeFalsy();
  const after = await c.ok("GET", `/canvases/${ref.id}`);
  expect(after.title).toBe(`${title} v2`);
  expect(itemsOf(after.document, "shape").map((s: any) => s.text).sort()).toEqual(["New", "Shape"]);

  const search = await tool("search", { query: `${title} v2` });
  expect(parsed(search).results.some((r: any) => r.id === ref.id)).toBe(true);
  const list = await tool("list_items", { kind: "canvas" });
  expect(JSON.stringify(parsed(list))).toContain(ref.id);
});

test("an unsupported diagram is a tool error, not a crash", async () => {
  const r = await tool("create_canvas", { title: `E2E mcp bad ${tag()}`, mermaid: "sequenceDiagram\n  A->>B: hi" });
  expect(r.isError).toBe(true);
  expect(r.content[0]!.text).toMatch(/flowchart/i);
  const missing = await tool("redraw_canvas", { id: "cnv_00000000-0000-0000-0000-000000000000", mermaid: "graph TD\n  A --> B" });
  expect(missing.isError).toBe(true);
});

test("create_project with note + canvas mermaid", async () => {
  const r = await tool("create_project", { title: `E2E mcp project ${tag()}`, note_markdown: "# Hi\n\nNote.", canvas_mermaid: "flowchart TD\n  P[Plan] --> S[Ship]", view: "canvas" });
  expect(r.isError).toBeFalsy();
  const p = parsed(r);
  made.push({ kind: "project", id: p.id });
  expect(p.id).toMatch(/^prj_/);
  const project = await c.ok("GET", `/projects/${p.id}`);
  const canvas = await c.ok("GET", `/canvases/${project.canvasId}`);
  expectOctodraw(canvas.document);
  expect(itemsOf(canvas.document, "shape").map((s: any) => s.text).sort()).toEqual(["Plan", "Ship"]);
  expect(r.structuredContent?.preview).toBeTruthy();
});

test("resources/read ui://octonote/preview returns the HTML app", async () => {
  const list = await mcp("resources/list");
  expect(list.body.result.resources.map((x: any) => x.uri)).toContain("ui://octonote/preview");
  const r = await mcp("resources/read", { uri: "ui://octonote/preview" });
  expect(r.status).toBe(200);
  const [content] = r.body.result.contents;
  expect(content.uri).toBe("ui://octonote/preview");
  expect(content.mimeType).toMatch(/text\/html/);
  expect(content.text).toMatch(/<html|<!doctype/i);
  expect(content.text.length).toBeGreaterThan(1000);
});

test("a revoked connection stops working", async () => {
  const before = new Set((await c.ok<any[]>("GET", "/me/connected-apps")).map((a) => a.id));
  const t = await oauthToken();
  expect((await mcp("tools/list", {}, t.access_token)).status).toBe(200);
  const apps = await c.ok<any[]>("GET", "/me/connected-apps");
  const mine = apps.filter((a) => !before.has(a.id));
  expect(mine.length).toBeGreaterThan(0);
  for (const a of mine) await c.ok("DELETE", `/me/connected-apps/${a.id}`);
  expect((await mcp("tools/list", {}, t.access_token)).status).toBe(401);
});
