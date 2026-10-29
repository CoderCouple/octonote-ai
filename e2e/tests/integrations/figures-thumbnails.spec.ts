/** Canvas figures (PUT/GET/list/delete, as the web app does) and canvas thumbnails. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { call, cleanup, devClient, otherClient, PNG_1PX, rfetch, tag, type Client } from "./_support";

let c: Client;
let other: Client;
const made: { kind: "canvas"; id: string }[] = [];
test.beforeAll(async () => {
  c = await devClient();
  other = await otherClient();
});
test.afterAll(async () => {
  await cleanup(c, made);
});

async function newCanvas() {
  const canvas = await c.ok("POST", `/workspaces/${c.workspaceId}/canvases`, { title: `E2E figures ${tag()}` });
  made.push({ kind: "canvas", id: canvas.id });
  return canvas;
}
const figId = () => `fig_${randomUUID()}`;
const input = (extra: Record<string, unknown> = {}) => ({ title: "E2E figure", width: 320.4, height: 200.6, contentHash: "h1", ...extra });

test("figures: create, update with PNG, read, list, delete", async () => {
  const canvas = await newCanvas();
  const id = figId();

  const created = await c.ok("PUT", `/canvases/${canvas.id}/figures/${id}`, input());
  expect(created).toMatchObject({ id, canvasId: canvas.id, title: "E2E figure", width: 320, height: 201, contentHash: "h1", imageUrl: null });

  // Without an image it isn't offered in the workspace picker yet.
  let ws = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/figures`);
  expect(ws.some((f) => f.id === id)).toBe(false);

  const withPng = await c.ok("PUT", `/canvases/${canvas.id}/figures/${id}`, input({ title: "E2E figure v2", contentHash: "h2", png: PNG_1PX }));
  expect(withPng.title).toBe("E2E figure v2");
  expect(withPng.imageUrl).toContain(`/storage/v1/object/public/canvas-figures/${id}.png?v=`);
  const img = await rfetch(withPng.imageUrl);
  expect(img.status).toBe(200);
  expect(img.headers.get("content-type")).toContain("image/png");

  // Title-only update keeps the picture.
  const titled = await c.ok("PUT", `/canvases/${canvas.id}/figures/${id}`, input({ title: "E2E figure v3", contentHash: "h2" }));
  expect(titled.imageUrl).toContain(`${id}.png`);

  const list = await c.ok<any[]>("GET", `/canvases/${canvas.id}/figures`);
  expect(list.map((f) => f.id)).toEqual([id]);
  const one = await c.ok("GET", `/figures/${id}`);
  expect(one.title).toBe("E2E figure v3");
  ws = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/figures`);
  expect(ws.find((f) => f.id === id)?.canvasTitle).toBe(canvas.title);

  expect(await c.ok("DELETE", `/canvases/${canvas.id}/figures/${id}`)).toEqual({ deleted: true });
  expect((await c.call("GET", `/figures/${id}`)).status).toBe(404);
  expect(await c.ok<any[]>("GET", `/canvases/${canvas.id}/figures`)).toEqual([]);
});

test("figures: bad ids, bad images, another canvas's figure", async () => {
  const canvas = await newCanvas();
  const second = await newCanvas();
  for (const bad of ["fig_123", "nope", `fig_${randomUUID().toUpperCase()}`]) {
    const r = await c.call("PUT", `/canvases/${canvas.id}/figures/${bad}`, input());
    expect(r.status, bad).toBe(400);
  }
  const notPng = Buffer.from("GIF89a not a png").toString("base64");
  expect((await c.call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input({ png: notPng }))).status).toBe(400);
  expect((await c.call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, { title: "x" })).status).toBe(400);
  expect((await c.call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input({ width: -1 }))).status).toBe(400);

  const id = figId();
  await c.ok("PUT", `/canvases/${canvas.id}/figures/${id}`, input());
  expect((await c.call("PUT", `/canvases/${second.id}/figures/${id}`, input())).status).toBe(409);
  // Deleting through the wrong canvas leaves it in place.
  await c.call("DELETE", `/canvases/${second.id}/figures/${id}`);
  expect((await c.call("GET", `/figures/${id}`)).status).toBe(200);
  expect((await c.call("GET", `/figures/fig_${randomUUID()}`)).status).toBe(404);
});

test("figures follow the canvas's permissions", async () => {
  const canvas = await newCanvas();
  const id = figId();
  await c.ok("PUT", `/canvases/${canvas.id}/figures/${id}`, input({ png: PNG_1PX }));

  expect([403, 404]).toContain((await other.call("GET", `/figures/${id}`)).status);
  expect([403, 404]).toContain((await other.call("GET", `/canvases/${canvas.id}/figures`)).status);
  expect([403, 404]).toContain((await other.call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input())).status);
  expect([403, 404]).toContain((await other.call("DELETE", `/canvases/${canvas.id}/figures/${id}`)).status);
  expect([403, 404]).toContain((await other.call("GET", `/workspaces/${c.workspaceId}/figures`)).status);
  expect([401, 403, 404]).toContain((await call("GET", `/figures/${id}`, undefined, null)).status);
  expect((await call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input(), null)).status).toBe(401);

  // Link-shared viewer: can read, can't write.
  await c.ok("PUT", `/canvas/${canvas.id}/general-access`, { linkAccess: "anyone_with_link", linkRole: "viewer" });
  expect((await call("GET", `/figures/${id}`, undefined, null)).status).toBe(200);
  expect((await other.call("GET", `/canvases/${canvas.id}/figures`)).status).toBe(200);
  expect((await other.call("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input())).status).toBe(403);
  expect((await other.call("DELETE", `/canvases/${canvas.id}/figures/${id}`)).status).toBe(403);
  expect((await c.call("GET", `/figures/${id}`)).status).toBe(200);
});

test("thumbnails: our storage URLs are accepted, foreign URLs rejected", async () => {
  const canvas = await newCanvas();
  // The storage origin the API itself uses (it may run with a LAN Supabase URL).
  const fig = await c.ok("PUT", `/canvases/${canvas.id}/figures/${figId()}`, input({ png: PNG_1PX }));
  const base = fig.imageUrl.slice(0, fig.imageUrl.indexOf("/storage/v1/object/"));
  const good = `${base}/storage/v1/object/public/canvas-thumbnails/${c.workspaceId}/${canvas.id}.png`;

  const ok = await c.ok("PATCH", `/canvases/${canvas.id}`, { thumbnailUrl: good });
  expect(ok.thumbnailUrl).toBe(good);
  expect((await c.ok("GET", `/canvases/${canvas.id}/summary`)).thumbnailUrl).toBe(good);

  for (const bad of [
    "https://evil.example.com/x.png",
    `https://evil.example.com/storage/v1/object/public/canvas-thumbnails/x.png`,
    `${base}.evil.example.com/storage/v1/object/x.png`,
    `${base}/rest/v1/canvases`,
    "javascript:alert(1)",
    "not a url",
  ]) {
    const r = await c.call("PATCH", `/canvases/${canvas.id}`, { thumbnailUrl: bad });
    expect(r.status, `${bad} → ${JSON.stringify(r.body)}`).toBe(400);
  }
  expect((await c.ok("GET", `/canvases/${canvas.id}`)).thumbnailUrl).toBe(good);

  const cleared = await c.ok("PATCH", `/canvases/${canvas.id}`, { thumbnailUrl: null });
  expect(cleared.thumbnailUrl).toBeNull();
});
