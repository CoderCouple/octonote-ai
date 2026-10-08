import { describe, expect, it } from "vitest";
import { detectShape, detectShapeVerbose, type Point } from "./shape-detector";

function lineStroke(x1: number, y1: number, x2: number, y2: number, steps = 40): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return out;
}

function circleStroke(cx: number, cy: number, r: number, steps = 64): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  return out;
}

function rectStroke(x: number, y: number, w: number, h: number, perSide = 20): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < perSide; i++) out.push({ x: x + (i / perSide) * w, y });
  for (let i = 0; i < perSide; i++) out.push({ x: x + w, y: y + (i / perSide) * h });
  for (let i = 0; i < perSide; i++) out.push({ x: x + w - (i / perSide) * w, y: y + h });
  for (let i = 0; i <= perSide; i++) out.push({ x, y: y + h - (i / perSide) * h });
  return out;
}

describe("detectShape — guards", () => {
  it("returns null when given too few points", () => {
    expect(detectShape([{ x: 0, y: 0 }])).toBeNull();
    expect(detectShapeVerbose([{ x: 0, y: 0 }]).debug.decision).toBe("skip-too-few-points");
  });

  it("returns null when the path is too short", () => {
    const tiny: Point[] = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 0 }));
    expect(detectShape(tiny)).toBeNull();
    expect(detectShapeVerbose(tiny).debug.decision).toBe("skip-too-short");
  });
});

describe("detectShape — line", () => {
  it("classifies a straight stroke as a line", () => {
    const stroke = lineStroke(0, 0, 200, 0);
    const result = detectShape(stroke);
    expect(result?.kind).toBe("line");
    if (result?.kind === "line") {
      expect(result.x1).toBe(0);
      expect(result.y1).toBe(0);
      expect(result.x2).toBe(200);
      expect(result.y2).toBe(0);
    }
  });

  it("classifies a diagonal straight stroke as a line", () => {
    const stroke = lineStroke(10, 20, 200, 250);
    expect(detectShape(stroke)?.kind).toBe("line");
  });
});

describe("detectShape — circle / ellipse", () => {
  it("classifies a closed round stroke as a circle", () => {
    const stroke = circleStroke(100, 100, 80);
    const r = detectShape(stroke);
    expect(r?.kind).toBe("circle");
    if (r?.kind === "circle") {
      expect(Math.abs(r.cx - 100)).toBeLessThan(2);
      expect(Math.abs(r.cy - 100)).toBeLessThan(2);
      expect(Math.abs(r.r - 80)).toBeLessThan(2);
    }
  });

  it("rejects a non-closed straight stroke as not-a-circle", () => {
    // Short non-closing curve — should not classify as circle.
    const stroke: Point[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = (i / 30) * Math.PI;
      stroke.push({ x: 100 + 80 * Math.cos(t), y: 100 + 80 * Math.sin(t) });
    }
    const r = detectShape(stroke);
    expect(r?.kind).not.toBe("circle");
  });
});

describe("detectShape — rectangle", () => {
  it("classifies a closed right-angled stroke as a rectangle", () => {
    const stroke = rectStroke(10, 10, 200, 100);
    const r = detectShape(stroke);
    expect(r?.kind).toBe("rectangle");
    if (r?.kind === "rectangle") {
      expect(r.x).toBe(10);
      expect(r.y).toBe(10);
      expect(r.w).toBe(200);
      expect(r.h).toBe(100);
    }
  });
});

describe("detectShape — verbose debug fields", () => {
  it("populates pathLength and cornerCount", () => {
    const { debug } = detectShapeVerbose(rectStroke(0, 0, 100, 100));
    expect(debug.pathLength).toBeGreaterThan(0);
    expect(debug.cornerCount).toBeGreaterThan(0);
    expect(debug.decision).toBe("rectangle");
  });
});
