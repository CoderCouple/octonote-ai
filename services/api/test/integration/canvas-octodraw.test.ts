/**
 * Canvases moved from tldraw snapshots to octodraw documents. Rows saved
 * before the switch are converted by `db:convert-canvases` (with the
 * original kept in document_tldraw); until then every read converts on the
 * fly and every write stores octodraw.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { canvases } from "../../src/db/schemas/canvases";
import { convertCanvases } from "../../src/scripts/convert-canvases";
import { canvasOutline } from "../../src/service/lib/canvas-outline";
import { createHarness, type Harness } from "./harness";

const TLDRAW = JSON.parse(readFileSync(join(__dirname, "../fixtures/tldraw-canvas.json"), "utf8")) as Record<string, unknown>;

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
});

/** Puts a canvas back in its pre-octodraw state: a tldraw snapshot, format 'tldraw', no backup. */
async function makeLegacy(id: string, document: unknown = TLDRAW) {
  await h.db
    .update(canvases)
    .set({ document: document as never, documentFormat: "tldraw", documentTldraw: null })
    .where(eq(canvases.id, id));
}

async function rowOf(id: string) {
  const [row] = await h.db.select().from(canvases).where(eq(canvases.id, id));
  return row!;
}

const itemsOf = (doc: unknown) => (doc as { items: { type: string; text?: string }[] }).items;

describe("new canvases", () => {
  it("start as empty octodraw documents, standalone and in projects", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Board" }, alice.id);
    expect(c.document).toEqual({ version: 1, items: [] });
    expect((await rowOf(c.id)).documentFormat).toBe("octodraw");
    const p = await h.projects.create(alice.workspaceId, { name: "Plan" }, alice.id);
    const row = await rowOf(p.canvasId);
    expect(row.documentFormat).toBe("octodraw");
    expect(row.document).toEqual({ version: 1, items: [] });
  });
});

describe("db:convert-canvases", () => {
  it("converts standalone, project and deleted canvases; dry run writes nothing; reruns are no-ops", async () => {
    const standalone = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    const { canvasId: projectCanvas } = await h.projects.create(alice.workspaceId, { name: "Plan" }, alice.id);
    const deleted = await h.canvases.create(alice.workspaceId, { title: "Old" }, alice.id);
    const empty = await h.canvases.create(alice.workspaceId, { title: "Empty" }, alice.id);
    const done = await h.canvases.create(alice.workspaceId, { title: "Already octodraw" }, alice.id);
    for (const id of [standalone.id, projectCanvas, deleted.id]) await makeLegacy(id);
    await makeLegacy(empty.id, {});
    await h.canvases.softDelete(deleted.id, alice.id);
    const before = await rowOf(standalone.id);

    const lines: string[] = [];
    const dry = await convertCanvases(h.db, { dryRun: true, batchSize: 2, log: (l) => lines.push(l) });
    expect(dry.scanned).toBe(4);
    expect(dry.converted).toBe(4);
    expect(dry.failed).toEqual([]);
    const flow = dry.canvases.find((c) => c.id === standalone.id)!;
    expect(flow.tldrawShapes).toBe(8);
    expect(flow.items).toEqual({ shape: 5, line: 3 });
    expect(lines.some((l) => l.startsWith("[dry-run]") && l.includes(standalone.id))).toBe(true);
    expect((await rowOf(standalone.id)).documentFormat).toBe("tldraw");
    expect((await rowOf(standalone.id)).document).toEqual(TLDRAW);

    const real = await convertCanvases(h.db, { batchSize: 2 });
    expect(real).toMatchObject({ scanned: 4, converted: 4, skipped: 0, failed: [] });
    for (const id of [standalone.id, projectCanvas, deleted.id]) {
      const row = await rowOf(id);
      expect(row.documentFormat).toBe("octodraw");
      expect(row.documentTldraw).toEqual(TLDRAW);
      expect(itemsOf(row.document)).toHaveLength(8);
    }
    const emptyRow = await rowOf(empty.id);
    expect(emptyRow.document).toEqual({ version: 1, items: [] });
    expect(emptyRow.documentFormat).toBe("octodraw");
    // Conversion doesn't reorder lists.
    expect((await rowOf(standalone.id)).updatedAt).toEqual(before.updatedAt);
    // The already-converted canvas was never touched.
    expect((await rowOf(done.id)).documentTldraw).toBeNull();

    const again = await convertCanvases(h.db);
    expect(again.scanned).toBe(0);
  });

  it("keeps an existing backup", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    const original = { ...TLDRAW, marker: "first" };
    await h.db
      .update(canvases)
      .set({ document: TLDRAW as never, documentFormat: "tldraw", documentTldraw: original as never })
      .where(eq(canvases.id, c.id));
    await convertCanvases(h.db);
    expect((await rowOf(c.id)).documentTldraw).toEqual(original);
  });
});

describe("reads before conversion", () => {
  it("GET and published reads return octodraw for a tldraw row", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    await makeLegacy(c.id);
    const { canvas } = await h.canvases.getOne(c.id, alice.id);
    expect(canvas.document.version).toBe(1);
    expect(itemsOf(canvas.document).filter((i) => i.type === "line")).toHaveLength(3);

    const state = await h.settings.setPublished("canvas", c.id, true, alice.id);
    const pub = await h.public.getBySlug(state.publicSlug!);
    const doc = (pub.resource as { document: unknown }).document;
    expect(itemsOf(doc)).toHaveLength(8);
    expect(JSON.stringify(pub)).not.toContain("typeName");
    // Reading never rewrites the row.
    expect((await rowOf(c.id)).documentFormat).toBe("tldraw");
  });

  it("a published project's canvas reads as octodraw", async () => {
    const p = await h.projects.create(alice.workspaceId, { name: "Plan" }, alice.id);
    await makeLegacy(p.canvasId);
    const state = await h.settings.setPublished("project", p.project.id, true, alice.id);
    const pub = await h.public.getBySlug(state.publicSlug!);
    const canvas = (pub.resource as { canvas: { document: unknown } }).canvas;
    expect(itemsOf(canvas.document)).toHaveLength(8);
  });
});

describe("writes", () => {
  it("stores octodraw as is and backs up the tldraw it replaces", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    await makeLegacy(c.id);
    const doc = { version: 1, items: [{ id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 100, h: 60, text: "Hi" }] };
    const saved = await h.canvases.update(c.id, { document: doc }, alice.id);
    expect(saved.document).toEqual(doc);
    const row = await rowOf(c.id);
    expect(row.documentFormat).toBe("octodraw");
    expect(row.documentTldraw).toEqual(TLDRAW);
    expect(row.document).toEqual(doc);
  });

  it("converts tldraw sent by an older client and keeps it as the backup", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    const saved = await h.canvases.update(c.id, { document: TLDRAW }, alice.id);
    expect(itemsOf(saved.document)).toHaveLength(8);
    const row = await rowOf(c.id);
    expect(row.documentFormat).toBe("octodraw");
    expect(row.documentTldraw).toEqual(TLDRAW);
    expect(itemsOf(row.document)).toHaveLength(8);

    // A later save doesn't overwrite the first backup.
    await h.canvases.update(c.id, { document: { version: 1, items: [] } }, alice.id);
    expect((await rowOf(c.id)).documentTldraw).toEqual(TLDRAW);
  });
});

describe("assistant card outline", () => {
  it("draws octodraw shapes and lines, with attached ends clipped to their boxes", async () => {
    const c = await h.canvasDiagrams.create(
      alice.workspaceId,
      { title: "Flow", mermaid: "graph LR\n  U((User)) --> A[API]\n  A -.->|yes| D{Cache?}" },
      alice.id,
    );
    const outline = canvasOutline(c.document)!;
    expect(outline.shapes.map((s) => s.label).sort()).toEqual(["API", "Cache?", "User"]);
    expect(outline.shapes.find((s) => s.label === "User")!.geo).toBe("ellipse");
    expect(outline.shapes.find((s) => s.label === "Cache?")!.geo).toBe("diamond");
    expect(outline.arrows).toHaveLength(2);
    const labelled = outline.arrows.find((a) => a.label === "yes")!;
    expect(labelled).toMatchObject({ dash: "dashed", end: "arrow", start: "none" });

    // Ends sit just outside the boxes they're attached to, not at their centres.
    const api = outline.shapes.find((s) => s.label === "API")!;
    const first = outline.arrows.find((a) => a.label !== "yes")!;
    const inside = (x: number, y: number) => x > api.x && x < api.x + api.w && y > api.y && y < api.y + api.h;
    expect(inside(first.x2, first.y2)).toBe(false);
    expect(Math.abs(first.x2 - api.x)).toBeLessThan(10);
  });

  it("draws nothing for an empty canvas", () => {
    expect(canvasOutline({ version: 1, items: [] })).toBeNull();
    expect(canvasOutline(null)).toBeNull();
  });
});
