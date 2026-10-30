/** Canvases store octodraw documents (`{ version: 1, items }`) only. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { canvases } from "../../src/db/schemas/canvases";
import { canvasOutline } from "../../src/service/lib/canvas-outline";
import { createHarness, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
});

async function rowOf(id: string) {
  const [row] = await h.db.select().from(canvases).where(eq(canvases.id, id));
  return row!;
}


describe("new canvases", () => {
  it("start as empty octodraw documents, standalone and in projects", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Board" }, alice.id);
    expect(c.document).toEqual({ version: 1, items: [] });
    const p = await h.projects.create(alice.workspaceId, { name: "Plan" }, alice.id);
    const row = await rowOf(p.canvasId);
    expect(row.document).toEqual({ version: 1, items: [] });
  });
});

describe("writes", () => {
  it("stores an octodraw document as is", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    const doc = { version: 1, items: [{ id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 100, h: 60, text: "Hi", fill: "none", dashed: true }] };
    const saved = await h.canvases.update(c.id, { document: doc }, alice.id);
    expect(saved.document).toEqual(doc);
    expect((await rowOf(c.id)).document).toEqual(doc);
  });

  it("rejects anything that isn't an octodraw document (e.g. an old tldraw snapshot)", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    const tldraw = { store: { "shape:a": { id: "shape:a", typeName: "shape", type: "geo", x: 0, y: 0, props: {} } }, schema: {} };
    await expect(h.canvases.update(c.id, { document: tldraw }, alice.id)).rejects.toThrow(/octodraw/);
    expect((await rowOf(c.id)).document).toEqual({ version: 1, items: [] });
  });

  it("rejects items that aren't objects with a string id and type", async () => {
    const c = await h.canvases.create(alice.workspaceId, { title: "Flow" }, alice.id);
    for (const item of [null, 42, "a", [], {}, { id: 1, type: "shape" }, { id: "a" }, { id: "", type: "shape" }]) {
      await expect(h.canvases.update(c.id, { document: { version: 1, items: [item] } }, alice.id)).rejects.toThrow(/Canvas item 0/);
    }
    expect((await rowOf(c.id)).document).toEqual({ version: 1, items: [] });
    // Unknown types are fine (a newer editor may add some).
    const doc = { version: 1, items: [{ id: "x", type: "future-thing", x: 0, y: 0, w: 1, h: 1 }] };
    expect((await h.canvases.update(c.id, { document: doc }, alice.id)).document).toEqual(doc);
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

  it("carries bends, anchors, dashed outlines and fills", () => {
    const doc = {
      version: 1,
      items: [
        { id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 100, h: 100, dashed: true, fill: "none" },
        { id: "b", type: "shape", shape: "rectangle", x: 300, y: 0, w: 100, h: 100, fill: "solid" },
        { id: "l", type: "line", x: 0, y: 0, w: 0, h: 0, bend: -30, start: { x: 0, y: 0, item: "a" }, end: { x: 0, y: 0, item: "b", anchor: { x: 0.5, y: 0 } } },
      ],
    };
    const o = canvasOutline(doc)!;
    expect(o.shapes.map((s) => [s.dash, s.fill])).toEqual([["dashed", "none"], ["solid", "solid"]]);
    const a = o.arrows[0]!;
    expect(a.bend).toBe(-30);
    // The end aims at b's top-middle and leaves along the curve (bulging up): just above b's top edge.
    expect(a.y2).toBeLessThan(0);
    expect(a.x2).toBeGreaterThan(300);
  });

  it("carries the newer style fields: stroke styles, arrowheads, per-part colours, routes", () => {
    const doc = {
      version: 1,
      items: [
        { id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 100, h: 100, strokeStyle: "dotted", fillColor: "green", strokeWidth: 4, opacity: 0.5 },
        { id: "b", type: "shape", shape: "rectangle", x: 300, y: 0, w: 100, h: 100, strokeStyle: "solid", dashed: true },
        { id: "l", type: "line", x: 0, y: 0, w: 0, h: 0, bend: 40, route: "elbow", startHead: "dot", endHead: "none", endArrow: true, strokeStyle: "dashed", start: { x: 0, y: 0, item: "a" }, end: { x: 0, y: 0, item: "b" } },
      ],
    };
    const o = canvasOutline(doc)!;
    expect(o.shapes.map((s) => [s.dash, s.color])).toEqual([["dotted", "green"], ["solid", "black"]]);
    expect(o.arrows[0]).toMatchObject({ dash: "dashed", start: "dot", end: "none", bend: 0 });
  });

  it("draws nothing for an empty canvas", () => {
    expect(canvasOutline({ version: 1, items: [] })).toBeNull();
    expect(canvasOutline(null)).toBeNull();
  });
});
