/** Projects: one note + one octodraw canvas, drawn from mermaid, published. */
import { expect, test } from "@playwright/test";
import { call, cleanup, devClient, expectOctodraw, itemsOf, tag, type Client } from "./_support";

let c: Client;
const made: { kind: "project"; id: string }[] = [];
test.beforeAll(async () => {
  c = await devClient();
});
test.afterAll(async () => {
  await cleanup(c, made);
});

test("a project owns an octodraw canvas, drawn from mermaid, and publishes both halves", async () => {
  const p = await c.ok("POST", `/workspaces/${c.workspaceId}/projects`, { name: `E2E project ${tag()}`, description: "e2e" });
  made.push({ kind: "project", id: p.id });
  expect(p.id).toMatch(/^prj_/);
  expect(p.noteId).toMatch(/^pag_/);
  expect(p.canvasId).toMatch(/^cnv_/);

  const blank = await c.ok("GET", `/canvases/${p.canvasId}`);
  expect(blank.projectId).toBe(p.id);
  expect(blank.document).toEqual({ version: 1, items: [] });

  await c.ok("PUT", `/pages/${p.noteId}/markdown`, { markdown: "# Plan\n\nSee the canvas." });
  const drawn = await c.ok("PUT", `/canvases/${p.canvasId}/mermaid`, { mermaid: "flowchart LR\n  A[Plan] --> B[Build] --> C[Ship]" });
  expectOctodraw(drawn.document);
  expect(itemsOf(drawn.document, "shape").map((s: any) => s.text).sort()).toEqual(["Build", "Plan", "Ship"]);
  expect(itemsOf(drawn.document, "line")).toHaveLength(2);

  // Project canvases stay out of the standalone list but are pickable.
  const standalone = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`);
  expect(standalone.some((x) => x.id === p.canvasId)).toBe(false);
  const pickable = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases/pickable`);
  expect(pickable.find((x) => x.id === p.canvasId)?.projectId).toBe(p.id);

  // A project's canvas can't be deleted on its own.
  expect((await c.call("DELETE", `/canvases/${p.canvasId}`)).status).toBe(400);

  const pub = await c.ok("PUT", `/project/${p.id}/publish`, { published: true });
  expect(pub.publicSlug).toBeTruthy();
  const view = await call("GET", `/public/${pub.publicSlug}`, undefined, null);
  expect(view.status).toBe(200);
  const res = view.result.resource;
  expect(res.kind).toBe("project");
  expect(res.note?.id).toBe(p.noteId);
  expect(res.canvas?.id).toBe(p.canvasId);
  expectOctodraw(res.canvas.document);
  expect(res.canvas.document).toEqual(drawn.document);

  const child = await call("GET", `/public/${pub.publicSlug}/canvas/${p.canvasId}`, undefined, null);
  expect(child.status).toBe(200);
  expect(child.result.resource.document).toEqual(drawn.document);

  // The canvas reports it's public via its project.
  const state = await c.ok("GET", `/canvas/${p.canvasId}/publish`);
  expect(state.publishedVia).toBeTruthy();

  await c.ok("PUT", `/project/${p.id}/publish`, { published: false });
  expect((await call("GET", `/public/${pub.publicSlug}`, undefined, null)).status).toBe(404);
});

test("deleting a project removes its canvas", async () => {
  const p = await c.ok("POST", `/workspaces/${c.workspaceId}/projects`, { name: `E2E project del ${tag()}` });
  await c.ok("DELETE", `/projects/${p.id}`);
  expect((await c.call("GET", `/canvases/${p.canvasId}`)).status).toBe(404);
});
