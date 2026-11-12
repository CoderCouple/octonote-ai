import { describe, expect, it } from "vitest";
import { EASINGS } from "../src/engine/easing.js";
import { evaluateFormula, FormulaError } from "../src/engine/formula.js";
import { circlePoints, morphPoints, pathLength, pointAlong, rectPoints, resample, SAMPLES } from "../src/engine/geometry.js";
import { computeLayout } from "../src/engine/layout.js";
import { texToText } from "../src/engine/render.js";
import { compileScene, valueAt } from "../src/engine/timeline.js";
import { validateScene, type Scene } from "../src/schema.js";

const close = (a: number, b: number, digits = 3) => expect(a).toBeCloseTo(b, digits);

function scene(partial: Partial<Scene>): Scene {
  const result = validateScene({ schemaVersion: "2.0", type: "scene", id: "t", ...partial });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

describe("easing", () => {
  it("starts at 0 and ends at 1", () => {
    for (const [name, fn] of Object.entries(EASINGS)) {
      if (name === "there_and_back") continue;
      close(fn(0), 0);
      close(fn(1), 1);
    }
    close(EASINGS.there_and_back(0.5), 1);
    close(EASINGS.there_and_back(1), 0);
  });
});

describe("geometry", () => {
  it("measures and walks along paths", () => {
    const square = rectPoints(0, 0, 2, 2);
    close(pathLength(square, true), 8);
    expect(pointAlong(square, 0, true)).toEqual(square[0]);
    const line: [number, number][] = [[0, 0], [4, 0]];
    expect(pointAlong(line, 0.25)).toEqual([1, 0]);
    expect(pointAlong(line, 1)).toEqual([4, 0]);
  });

  it("resamples to evenly spaced points", () => {
    const pts = resample([[0, 0], [10, 0]], 11, false);
    expect(pts).toHaveLength(11);
    pts.forEach((p, i) => close(p[0], i));
  });

  it("morphs from one shape into another", () => {
    const circle = circlePoints(0, 0, 1);
    const square = rectPoints(3, 0, 2, 2);
    const start = morphPoints(circle, square, 0, true);
    const end = morphPoints(circle, square, 1, true);
    expect(start).toHaveLength(SAMPLES);
    for (const p of start) close(Math.hypot(p[0], p[1]), 1, 1);
    // Every end point is on the square's edge.
    for (const p of end) expect(Math.max(Math.abs(p[0] - 3), Math.abs(p[1]))).toBeCloseTo(1, 2);
  });
});

describe("formulas", () => {
  it("evaluates safely", () => {
    expect(evaluateFormula("x^2 / 4 + sin(0)", { x: 4 })).toBe(4);
    // Prototype names are unknown names, not lookups.
    expect(evaluateFormula("constructor + toString", {})).toBeNaN();
    expect(() => evaluateFormula("x +", { x: 1 })).toThrow(FormulaError);
  });
});

describe("TeX fallback", () => {
  it("turns common TeX into readable text", () => {
    expect(texToText("a^2 + b^2 = c^2")).toBe("a² + b² = c²");
    expect(texToText("A = \\pi r^2")).toBe("A = π r²");
    expect(texToText("\\sin(x)")).toBe("sin (x)");
  });
});

describe("layout", () => {
  it("places elements by relationship, in groups and on axes", () => {
    const s = scene({
      elements: [
        { id: "title", shape: "text", text: "Hello", at: [0, 3] },
        { id: "below", shape: "circle", r: 0.5, at: { of: "title", side: "below", gap: 0.5 } },
        { id: "a", shape: "rect", w: 1, h: 1 },
        { id: "b", shape: "rect", w: 1, h: 1 },
        { id: "row", shape: "group", children: ["a", "b"], gap: 1, at: [0, -2] },
        { id: "ax", shape: "axes", x: [0, 10, 1], y: [0, 100, 10], width: 8, height: 4, at: [0, 0] },
        { id: "f", shape: "plot", axes: "ax", y: "x^2" },
        { id: "p", shape: "dot", at: { axes: "ax", x: 5, plot: "f" } },
      ],
      steps: [{ actions: [] }],
    });
    const layout = computeLayout(s);
    const title = layout.boxes.get("title")!;
    const below = layout.boxes.get("below")!;
    close(below.x, 0);
    close(below.y, title.y - title.h / 2 - 0.5 - 0.5);
    const a = layout.boxes.get("a")!;
    const b = layout.boxes.get("b")!;
    close(b.x - a.x, 2);
    close(a.y, -2);
    close((a.x + b.x) / 2, 0);
    const frame = layout.axes.get("ax")!;
    const [px, py] = frame.toCanvas(5, 25);
    const dot = layout.boxes.get("p")!;
    close(dot.x, px);
    close(dot.y, py);
    expect(layout.plots.get("f")!.length).toBeGreaterThan(10);
  });

  it("uses a tall canvas for portrait scenes", () => {
    const layout = computeLayout(scene({ orientation: "portrait", elements: [{ id: "d", shape: "dot" }], steps: [{ actions: [] }] }));
    expect(layout.canvas).toEqual({ w: 9, h: 16 });
  });
});

describe("timeline", () => {
  const s = scene({
    elements: [
      { id: "c", shape: "circle", r: 1, hidden: true },
      { id: "n", shape: "number", value: 0 },
    ],
    steps: [
      { caption: "One", actions: [{ do: "fadeIn", target: "c", duration: 1, ease: "linear" }], hold: 0.5 },
      { caption: "Two", actions: [{ do: "move", target: "c", by: [2, 0], duration: 1 }, { do: "count", target: "n", to: 100, duration: 2, ease: "linear" }], hold: 0 },
    ],
  });
  const compiled = compileScene(s, computeLayout(s));

  it("lays steps end to end, with holds", () => {
    expect(compiled.steps).toEqual([
      { start: 0, end: 1.5, caption: "One" },
      { start: 1.5, end: 3.5, caption: "Two" },
    ]);
    expect(compiled.duration).toBe(3.5);
  });

  it("is a pure function of time, so scrubbing backwards works", () => {
    expect(valueAt(compiled, "c", "opacity", 0, 1)).toBe(0);
    close(valueAt(compiled, "c", "opacity", 0.5, 1), 0.5);
    expect(valueAt(compiled, "c", "opacity", 1.2, 1)).toBe(1);
    close(valueAt(compiled, "n", "value", 2.5, 0), 50);
    expect(valueAt(compiled, "c", "dx", 3.5, 0)).toBe(2);
    // Back to the start again.
    expect(valueAt(compiled, "c", "dx", 0, 0)).toBe(0);
    expect(valueAt(compiled, "n", "value", 0.1, 0)).toBe(0);
  });
});
