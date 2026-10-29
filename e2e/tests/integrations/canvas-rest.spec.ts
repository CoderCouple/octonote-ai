/** REST: octodraw canvases over /canvases (create, save, validation, concurrent saves). */
import { expect, test } from "@playwright/test";
import { call, canonical, cleanup, devClient, expectOctodraw, richDocument, sql, tag, tldrawDocument, type Client } from "./_support";

let c: Client;
const made: { kind: "canvas"; id: string }[] = [];

test.beforeAll(async () => {
  c = await devClient();
});
test.afterAll(async () => {
  await cleanup(c, made);
});

async function newCanvas(title = `E2E canvas ${tag()}`) {
  const canvas = await c.ok("POST", `/workspaces/${c.workspaceId}/canvases`, { title });
  made.push({ kind: "canvas", id: canvas.id });
  return canvas;
}

test("a new canvas is a blank octodraw document", async () => {
  const canvas = await newCanvas();
  expect(canvas.id).toMatch(/^cnv_/);
  expect(canvas.myRole).toBe("owner");
  expect(canvas.document).toEqual({ version: 1, items: [] });
  expect(JSON.parse(sql(`select document::text from canvases where id = '${canvas.id}'`))).toEqual({ version: 1, items: [] });
  const got = await c.ok("GET", `/canvases/${canvas.id}`);
  expect(got.document).toEqual({ version: 1, items: [] });
  // It shows up in the standalone list.
  const list = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`);
  expect(list.some((x) => x.id === canvas.id)).toBe(true);
});

test("an octodraw document round-trips exactly, incl. bend/anchor/align/valign/dashed/fill/link", async () => {
  const canvas = await newCanvas();
  const doc = richDocument();
  const saved = await c.ok("PATCH", `/canvases/${canvas.id}`, { document: doc });
  expect(canonical(saved.document)).toBe(canonical(doc));
  const got = await c.ok("GET", `/canvases/${canvas.id}`);
  expect(canonical(got.document)).toBe(canonical(doc));
  // And in the database itself.
  const stored = JSON.parse(sql(`select document::text from canvases where id = '${canvas.id}'`));
  expect(canonical(stored)).toBe(canonical(doc));
  const line = got.document.items.find((i: any) => i.id === "l1");
  expect(line.bend).toBe(42.5);
  expect(line.start.anchor).toEqual({ x: 1, y: 0.5 });
  const s1 = got.document.items.find((i: any) => i.id === "s1");
  expect([s1.align, s1.valign, s1.dashed, s1.fill, s1.link]).toEqual(["left", "top", true, "none", "https://octonote.ai/docs"]);
});

test("title-only PATCH leaves the document alone", async () => {
  const canvas = await newCanvas();
  await c.ok("PATCH", `/canvases/${canvas.id}`, { document: richDocument() });
  const renamed = await c.ok("PATCH", `/canvases/${canvas.id}`, { title: "E2E renamed" });
  expect(renamed.title).toBe("E2E renamed");
  expect(canonical(renamed.document)).toBe(canonical(richDocument()));
});

test("a tldraw-shaped document is rejected with 400", async () => {
  const canvas = await newCanvas();
  const r = await c.call("PATCH", `/canvases/${canvas.id}`, { document: tldrawDocument() });
  expect(r.status, JSON.stringify(r.body)).toBe(400);
  expect(r.body.success).toBe(false);
  const got = await c.ok("GET", `/canvases/${canvas.id}`);
  expect(got.document).toEqual({ version: 1, items: [] });
});

test("invalid documents are rejected with 400 and nothing is saved", async () => {
  const canvas = await newCanvas();
  await c.ok("PATCH", `/canvases/${canvas.id}`, { document: richDocument() });
  const bad: unknown[] = [
    { foo: 1 },
    { version: 2, items: [] },
    { version: 1 },
    { version: 1, items: "nope" },
    "a string",
    42,
    [],
    null,
    // Malformed items would break the editor / published page for everyone.
    { version: 1, items: [null] },
    { version: 1, items: [42] },
    { version: 1, items: [{}] },
    { version: 1, items: [{ id: 1, type: "shape" }] },
    { version: 1, items: [{ id: "ok", type: "shape", shape: "rectangle", x: 0, y: 0, w: 1, h: 1 }, { type: "shape" }] },
  ];
  for (const document of bad) {
    const r = await c.call("PATCH", `/canvases/${canvas.id}`, { document });
    expect(r.status, `document ${JSON.stringify(document)} → ${JSON.stringify(r.body)}`).toBe(400);
    expect(r.body.errorCode).toBeTruthy();
  }
  const got = await c.ok("GET", `/canvases/${canvas.id}`);
  expect(canonical(got.document)).toBe(canonical(richDocument()));
});

test("bad ids and missing canvases", async () => {
  expect((await c.call("GET", `/canvases/cnv_00000000-0000-0000-0000-000000000000`)).status).toBe(404);
  expect((await c.call("PATCH", `/canvases/cnv_00000000-0000-0000-0000-000000000000`, { title: "x" })).status).toBe(404);
  const empty = await c.call("POST", `/workspaces/${c.workspaceId}/canvases`, { title: "" });
  expect(empty.status).toBe(400);
});

test("signed-out callers can't read or save a restricted canvas", async () => {
  const canvas = await newCanvas();
  const read = await call("GET", `/canvases/${canvas.id}`, undefined, null);
  expect([401, 403, 404]).toContain(read.status);
  const write = await call("PATCH", `/canvases/${canvas.id}`, { title: "hijack" }, null);
  expect(write.status).toBe(401);
});

test("delete soft-deletes: the canvas is gone from reads and lists", async () => {
  const canvas = await c.ok("POST", `/workspaces/${c.workspaceId}/canvases`, { title: `E2E delete ${tag()}` });
  const del = await c.ok("DELETE", `/canvases/${canvas.id}`);
  expect(del.deletedAt).toBeTruthy();
  expect((await c.call("GET", `/canvases/${canvas.id}`)).status).toBe(404);
  const list = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`);
  expect(list.some((x) => x.id === canvas.id)).toBe(false);
});

test.describe("concurrency guard", () => {
  test("two quick PATCHes leave one whole, valid document (never a mix)", async () => {
    const canvas = await newCanvas();
    const a = { version: 1, items: [{ id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 10, h: 10, text: "A" }] };
    const b = {
      version: 1,
      items: [
        { id: "b1", type: "shape", shape: "ellipse", x: 5, y: 5, w: 20, h: 20, text: "B" },
        { id: "b2", type: "line", x: 0, y: 0, w: 0, h: 0, start: { x: 0, y: 0, item: "b1" }, end: { x: 50, y: 50 }, bend: 7 },
      ],
    };
    const [ra, rb] = await Promise.all([
      c.call("PATCH", `/canvases/${canvas.id}`, { document: a }),
      c.call("PATCH", `/canvases/${canvas.id}`, { document: b }),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    const got = await c.ok("GET", `/canvases/${canvas.id}`);
    expectOctodraw(got.document);
    expect([canonical(a), canonical(b)]).toContain(canonical(got.document));
  });

  test("a title PATCH racing a document PATCH keeps both", async () => {
    const canvas = await newCanvas();
    const doc = richDocument();
    await Promise.all([
      c.ok("PATCH", `/canvases/${canvas.id}`, { document: doc }),
      c.ok("PATCH", `/canvases/${canvas.id}`, { title: "E2E raced title" }),
    ]);
    const got = await c.ok("GET", `/canvases/${canvas.id}`);
    expect(got.title).toBe("E2E raced title");
    expect(canonical(got.document)).toBe(canonical(doc));
  });

  test("ten rapid autosaves end on a valid document from the burst", async () => {
    const canvas = await newCanvas();
    const docs = Array.from({ length: 10 }, (_, i) => ({
      version: 1,
      items: Array.from({ length: i + 1 }, (_, j) => ({ id: `s${j}`, type: "shape", shape: "rectangle", x: j * 20, y: 0, w: 10, h: 10, text: `v${i}` })),
    }));
    const res = await Promise.all(docs.map((document) => c.call("PATCH", `/canvases/${canvas.id}`, { document })));
    for (const r of res) expect(r.status).toBe(200);
    const got = await c.ok("GET", `/canvases/${canvas.id}`);
    expect(docs.map(canonical)).toContain(canonical(got.document));
  });
});
