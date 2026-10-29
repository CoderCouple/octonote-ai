/** Publishing + sharing + permissions for canvases. */
import { expect, test } from "@playwright/test";
import { call, cleanup, devClient, expectOctodraw, otherClient, richDocument, tag, type Client } from "./_support";

let c: Client;
let other: Client;
const made: { kind: "canvas" | "notebook"; id: string }[] = [];
test.beforeAll(async () => {
  c = await devClient();
  other = await otherClient();
  expect(other.userId).not.toBe(c.userId);
});
test.afterAll(async () => {
  await cleanup(c, made);
});

async function canvasWithDoc(title = `E2E pub ${tag()}`) {
  const canvas = await c.ok("POST", `/workspaces/${c.workspaceId}/canvases`, { title });
  made.push({ kind: "canvas", id: canvas.id });
  await c.ok("PATCH", `/canvases/${canvas.id}`, { document: richDocument() });
  return canvas;
}

test("publish → public endpoints serve the octodraw document; unpublish removes it", async () => {
  const canvas = await canvasWithDoc();
  const pub = await c.ok("PUT", `/canvas/${canvas.id}/publish`, { published: true });
  expect(pub.published).toBe(true);
  expect(pub.publicUrl).toContain(`/pub/${pub.publicSlug}`);

  const view = await call("GET", `/public/${pub.publicSlug}`, undefined, null);
  expect(view.status).toBe(200);
  expect(view.result.root).toMatchObject({ kind: "canvas", id: canvas.id, slug: pub.publicSlug });
  expect(view.result.resource.kind).toBe("canvas");
  expectOctodraw(view.result.resource.document);
  expect(view.result.resource.document).toEqual(richDocument());
  // Byline: name/avatar only, never email or ids.
  expect(JSON.stringify(view.result.byline)).not.toContain(c.email);

  const self = await call("GET", `/public/${pub.publicSlug}/canvas/${canvas.id}`, undefined, null);
  expect(self.status).toBe(200);
  expect(self.result.resource.document).toEqual(richDocument());

  // Edits show up on the public page (read-time, not copied).
  await c.ok("PATCH", `/canvases/${canvas.id}`, { document: { version: 1, items: [] } });
  expect((await call("GET", `/public/${pub.publicSlug}`, undefined, null)).result.resource.document).toEqual({ version: 1, items: [] });

  // Public doesn't mean editable.
  expect((await call("PATCH", `/canvases/${canvas.id}`, { title: "x" }, null)).status).toBe(401);
  expect([403, 404]).toContain((await other.call("PATCH", `/canvases/${canvas.id}`, { title: "x" })).status);

  await c.ok("PUT", `/canvas/${canvas.id}/publish`, { published: false });
  expect((await call("GET", `/public/${pub.publicSlug}`, undefined, null)).status).toBe(404);
  expect((await call("GET", `/public/${pub.publicSlug}/canvas/${canvas.id}`, undefined, null)).status).toBe(404);
});

test("a canvas in a published notebook is public by inheritance (and stops being when moved out)", async () => {
  const nb = await c.ok("POST", `/workspaces/${c.workspaceId}/notebooks`, { name: `E2E notebook ${tag()}` });
  made.push({ kind: "notebook", id: nb.id });
  const canvas = await canvasWithDoc();
  const unrelated = await canvasWithDoc();
  await c.ok("POST", `/canvases/${canvas.id}/move`, { notebookId: nb.id });

  const pub = await c.ok("PUT", `/notebook/${nb.id}/publish`, { published: true });
  const view = await call("GET", `/public/${pub.publicSlug}`, undefined, null);
  expect(view.status).toBe(200);
  expect(view.result.resource.kind).toBe("notebook");
  expect(view.result.resource.items.some((i: any) => i.kind === "canvas" && i.id === canvas.id)).toBe(true);

  const child = await call("GET", `/public/${pub.publicSlug}/canvas/${canvas.id}`, undefined, null);
  expect(child.status).toBe(200);
  expectOctodraw(child.result.resource.document);
  expect(child.result.resource.document).toEqual(richDocument());

  const state = await c.ok("GET", `/canvas/${canvas.id}/publish`);
  expect(state.publishedVia).toBeTruthy();

  // Something outside the notebook can't be read through its slug.
  expect((await call("GET", `/public/${pub.publicSlug}/canvas/${unrelated.id}`, undefined, null)).status).toBe(404);

  // A canvas added later is public automatically.
  const later = await canvasWithDoc();
  await c.ok("POST", `/canvases/${later.id}/move`, { notebookId: nb.id });
  expect((await call("GET", `/public/${pub.publicSlug}/canvas/${later.id}`, undefined, null)).status).toBe(200);

  // Moved out → no longer readable via the notebook.
  await c.ok("POST", `/canvases/${canvas.id}/move`, { notebookId: null });
  expect((await call("GET", `/public/${pub.publicSlug}/canvas/${canvas.id}`, undefined, null)).status).toBe(404);

  await c.ok("PUT", `/notebook/${nb.id}/publish`, { published: false });
  expect((await call("GET", `/public/${pub.publicSlug}/canvas/${later.id}`, undefined, null)).status).toBe(404);
});

test("anyone-with-the-link (viewer) lets signed-out and other users read, never write", async () => {
  const canvas = await canvasWithDoc();
  await c.ok("PUT", `/canvas/${canvas.id}/general-access`, { linkAccess: "anyone_with_link", linkRole: "viewer" });

  const anon = await call("GET", `/canvases/${canvas.id}`, undefined, null);
  expect(anon.status).toBe(200);
  expect(anon.result.document).toEqual(richDocument());
  expect(anon.result.myRole).toBe("viewer");

  const byOther = await other.call("GET", `/canvases/${canvas.id}`);
  expect(byOther.status).toBe(200);
  expect(byOther.result.myRole).toBe("viewer");
  expect((await other.call("PATCH", `/canvases/${canvas.id}`, { document: { version: 1, items: [] } })).status).toBe(403);
  expect((await other.call("PUT", `/canvases/${canvas.id}/mermaid`, { mermaid: "graph TD\n  A --> B" })).status).toBe(403);
  expect((await other.call("DELETE", `/canvases/${canvas.id}`)).status).toBe(403);

  await c.ok("PUT", `/canvas/${canvas.id}/general-access`, { linkAccess: "restricted", linkRole: "viewer" });
  expect([401, 403, 404]).toContain((await call("GET", `/canvases/${canvas.id}`, undefined, null)).status);
  expect([403, 404]).toContain((await other.call("GET", `/canvases/${canvas.id}`)).status);
  // Still intact.
  expect((await c.ok("GET", `/canvases/${canvas.id}`)).document).toEqual(richDocument());
});

test("anyone-with-the-link (editor) lets another signed-in user save; anonymous still can't", async () => {
  const canvas = await canvasWithDoc();
  await c.ok("PUT", `/canvas/${canvas.id}/general-access`, { linkAccess: "anyone_with_link", linkRole: "editor" });
  const doc = { version: 1, items: [{ id: "x", type: "sticky", x: 0, y: 0, w: 100, h: 100, text: "from other" }] };
  expect((await other.call("PATCH", `/canvases/${canvas.id}`, { document: doc })).status).toBe(200);
  expect((await c.ok("GET", `/canvases/${canvas.id}`)).document).toEqual(doc);
  expect((await call("PATCH", `/canvases/${canvas.id}`, { document: richDocument() }, null)).status).toBe(401);
  // Editors can't publish or delete (owner-only "manage").
  expect((await other.call("PUT", `/canvas/${canvas.id}/publish`, { published: true })).status).toBe(403);
  expect((await other.call("DELETE", `/canvases/${canvas.id}`)).status).toBe(403);
});

test("a user without access gets 404/403 everywhere", async () => {
  const canvas = await canvasWithDoc();
  for (const [m, p, b] of [
    ["GET", `/canvases/${canvas.id}`],
    ["GET", `/canvases/${canvas.id}/summary`],
    ["PATCH", `/canvases/${canvas.id}`, { title: "x" }],
    ["PUT", `/canvases/${canvas.id}/mermaid`, { mermaid: "graph TD\n  A --> B" }],
    ["DELETE", `/canvases/${canvas.id}`],
    ["POST", `/canvases/${canvas.id}/move`, { notebookId: null }],
    ["PUT", `/canvas/${canvas.id}/publish`, { published: true }],
    ["GET", `/canvas/${canvas.id}/shares`],
  ] as [string, string, unknown?][]) {
    const r = await other.call(m, p, b);
    expect([403, 404], `${m} ${p} → ${r.status}`).toContain(r.status);
  }
  // Nor can they list or create in the owner's workspace.
  expect([403, 404]).toContain((await other.call("GET", `/workspaces/${c.workspaceId}/canvases`)).status);
  expect([403, 404]).toContain((await other.call("POST", `/workspaces/${c.workspaceId}/canvases`, { title: "E2E intruder" })).status);
  expect((await c.ok("GET", `/canvases/${canvas.id}`)).document).toEqual(richDocument());
});

test("a per-person viewer share allows reading only", async () => {
  const canvas = await canvasWithDoc();
  const share = await c.ok("POST", `/shares`, { resourceKind: "canvas", resourceId: canvas.id, email: other.email, role: "viewer" });
  const r = await other.call("GET", `/canvases/${canvas.id}`);
  expect(r.status).toBe(200);
  expect(r.result.myRole).toBe("viewer");
  expect((await other.call("PATCH", `/canvases/${canvas.id}`, { title: "x" })).status).toBe(403);
  await c.ok("PATCH", `/shares/${share.id}`, { role: "editor" });
  expect((await other.call("PATCH", `/canvases/${canvas.id}`, { title: "E2E shared edit" })).status).toBe(200);
  expect((await c.call("DELETE", `/shares/${share.id}`)).status).toBe(204);
  expect([403, 404]).toContain((await other.call("GET", `/canvases/${canvas.id}`)).status);
});
