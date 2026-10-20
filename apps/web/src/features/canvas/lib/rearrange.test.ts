import { describe, expect, it } from "vitest";
import { rearrangeLayout, type RearrangeBox } from "./rearrange";

const box = (id: string, x: number, y: number, w = 120, h = 56): RearrangeBox => ({ id, x, y, w, h });
const overlaps = (a: RearrangeBox, b: RearrangeBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A messy chain A → B → C, with D off to the side and boxes on top of each other.
const input = {
  boxes: [box("A", 500, 400), box("B", 520, 410), box("C", 0, 0), box("D", 300, 300)],
  edges: [
    { from: "A", to: "B" },
    { from: "B", to: "C", label: "yes" },
  ],
};

describe("rearrange", () => {
  it("vertical: follows the arrows top to bottom, with nothing overlapping", () => {
    const p = rearrangeLayout(input, "vertical");
    expect(p.get("A")!.y).toBeLessThan(p.get("B")!.y);
    expect(p.get("B")!.y).toBeLessThan(p.get("C")!.y);
    const all = [...p.values()];
    for (const a of all) for (const b of all) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });

  it("horizontal: follows the arrows left to right", () => {
    const p = rearrangeLayout(input, "horizontal");
    expect(p.get("A")!.x).toBeLessThan(p.get("B")!.x);
    expect(p.get("B")!.x).toBeLessThan(p.get("C")!.x);
  });

  it("keeps the drawing's top-left corner and every box's size", () => {
    const p = rearrangeLayout(input, "vertical");
    expect(Math.min(...[...p.values()].map((b) => b.x))).toBeCloseTo(0);
    expect(Math.min(...[...p.values()].map((b) => b.y))).toBeCloseTo(0);
    expect(p.get("A")).toMatchObject({ w: 120, h: 56 });
  });

  it("keeps a surrounding box around its contents", () => {
    const p = rearrangeLayout(
      {
        boxes: [box("group", 0, 0, 600, 400), box("A", 40, 60), box("B", 300, 60), box("C", 900, 0)],
        edges: [
          { from: "A", to: "B" },
          { from: "B", to: "C" },
        ],
      },
      "vertical",
    );
    const g = p.get("group")!;
    for (const id of ["A", "B"]) {
      const b = p.get(id)!;
      expect(b.x).toBeGreaterThanOrEqual(g.x);
      expect(b.y).toBeGreaterThan(g.y);
      expect(b.x + b.w).toBeLessThanOrEqual(g.x + g.w);
      expect(b.y + b.h).toBeLessThanOrEqual(g.y + g.h);
    }
    expect(overlaps(g, p.get("C")!)).toBe(false);
  });
});
