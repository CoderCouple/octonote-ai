import { lineBetween, type CanvasDocument, type CanvasItem } from "@octonote/octodraw";
import { describe, expect, it } from "vitest";
import { rearrangeDocument } from "./rearrange";

const shape = (id: string, x: number, y: number, w = 120, h = 60): CanvasItem => ({
  id,
  type: "shape",
  shape: "rectangle",
  x,
  y,
  w,
  h,
});
const arrow = (id: string, from: string, to: string): CanvasItem => ({
  ...lineBetween({ x: 0, y: 0, item: from }, { x: 0, y: 0, item: to }),
  id,
});
const box = (doc: CanvasDocument, id: string) => doc.items.find((i) => i.id === id)!;
const inside = (outer: CanvasItem, inner: CanvasItem) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.w >= inner.x + inner.w &&
  outer.y + outer.h >= inner.y + inner.h;

describe("rearrange a canvas document", () => {
  const doc: CanvasDocument = {
    version: 1,
    items: [
      shape("group", 0, 0, 700, 300),
      shape("a", 400, 100),
      shape("b", 40, 120),
      shape("c", 900, 600),
      arrow("ab", "a", "b"),
      arrow("bc", "b", "c"),
    ],
  };

  it("chains attached boxes, keeps the group around its boxes, and leaves the input alone", () => {
    const next = rearrangeDocument(doc, [], "vertical")!;
    expect(box(next, "a").y).toBeLessThan(box(next, "b").y);
    expect(box(next, "b").y).toBeLessThan(box(next, "c").y);
    expect(inside(box(next, "group"), box(next, "a"))).toBe(true);
    expect(inside(box(next, "group"), box(next, "b"))).toBe(true);
    expect(inside(box(next, "group"), box(next, "c"))).toBe(false);
    expect(box(doc, "a").y).toBe(100);
  });

  it("moves attached arrow ends with their boxes", () => {
    const next = rearrangeDocument(doc, [], "horizontal")!;
    const line = box(next, "bc");
    if (line.type !== "line") throw new Error("not a line");
    const c = box(next, "c");
    expect(line.end.x).toBeGreaterThanOrEqual(c.x - 8);
    expect(line.end.x).toBeLessThanOrEqual(c.x + c.w + 8);
  });

  it("does nothing with fewer than two boxes", () => {
    expect(rearrangeDocument({ version: 1, items: [shape("a", 0, 0)] }, [], "vertical")).toBeNull();
  });
});
