import type { Scene, SceneElement } from "../schema.js";
import { compile, evaluate } from "./formula.js";
import { bounds, boxEdge, bracePoints, circlePoints, rectPoints, regularPolygon, rotatePoint, smoothCurve, type Box, type Point } from "./geometry.js";

export const CANVAS = { landscape: { w: 16, h: 9 }, portrait: { w: 9, h: 16 } } as const;

export interface AxesFrame {
  box: Box;
  x: [number, number, number];
  y: [number, number, number];
  toCanvas(x: number, y: number): Point;
}

/** Where everything is before anything moves: boxes, outlines, axes frames and plot samples. */
export interface Layout {
  canvas: { w: number; h: number };
  boxes: Map<string, Box>;
  /** Absolute outline points for shapes that have one (morph, draw, trace). */
  outlines: Map<string, { points: Point[]; closed: boolean }>;
  axes: Map<string, AxesFrame>;
  /** Plot samples; NaN points mark breaks where the curve leaves the axes. */
  plots: Map<string, Point[]>;
  parent: Map<string, string>;
  byId: Map<string, SceneElement>;
}

export const TEXT_SIZE = 0.45;

/** Text has no measured width before it renders; this estimate is close for sans-serif. */
export function textWidth(text: string, size: number, bold = false): number {
  return text.length * size * (bold ? 0.6 : 0.55);
}

/** Visible characters in TeX, roughly: commands and braces don't take space. */
export function texWidth(tex: string, size: number): number {
  const visible = tex.replace(/\\(frac|sqrt|left|right|text|mathrm|mathbf|cdot|times)/g, "x").replace(/\\[a-zA-Z]+/g, "x").replace(/[{}^_\s]/g, "");
  return Math.max(1, visible.length) * size * 0.55;
}

function intrinsicSize(el: SceneElement): { w: number; h: number } {
  switch (el.shape) {
    case "rect":
      return { w: el.w, h: el.h };
    case "circle":
      return { w: el.r * 2, h: el.r * 2 };
    case "ellipse":
      return { w: el.rx * 2, h: el.ry * 2 };
    case "dot":
      return { w: (el.r ?? 0.08) * 2, h: (el.r ?? 0.08) * 2 };
    case "polygon": {
      if (el.points) {
        const b = bounds(el.points as Point[]);
        return { w: b.w, h: b.h };
      }
      return { w: (el.r ?? 1) * 2, h: (el.r ?? 1) * 2 };
    }
    case "arc":
      return { w: el.r * 2, h: el.r * 2 };
    case "text":
      return { w: textWidth(el.text, el.size ?? TEXT_SIZE, el.weight === "bold"), h: (el.size ?? TEXT_SIZE) * 1.25 };
    case "math":
      return { w: texWidth(el.tex, el.size ?? 0.55), h: (el.size ?? 0.55) * 1.5 };
    case "number": {
      const size = el.size ?? 0.8;
      const shown = `${el.prefix ?? ""}${el.value.toFixed(el.decimals ?? 0)}${el.suffix ?? ""}`;
      return { w: textWidth(shown, size, true), h: size * 1.25 };
    }
    case "axes":
      return { w: el.width ?? 8, h: el.height ?? 4.5 };
    case "numberline":
      return { w: el.width ?? 10, h: 0.7 };
    case "bars":
      return { w: el.width ?? 6, h: el.height ?? 3.5 };
    case "table": {
      const [cw, ch] = el.cell ?? [1.6, 0.6];
      return { w: cw * Math.max(...el.rows.map((r) => r.length)), h: ch * el.rows.length };
    }
    case "grid":
      return { w: el.cols * (el.cell ?? 0.5), h: el.rows * (el.cell ?? 0.5) };
    default:
      return { w: 0, h: 0 };
  }
}

export function computeLayout(scene: Scene): Layout {
  const canvas = CANVAS[scene.orientation ?? "landscape"];
  const byId = new Map(scene.elements.map((el) => [el.id, el]));
  const parent = new Map<string, string>();
  for (const el of scene.elements) if (el.shape === "group") for (const c of el.children) parent.set(c, el.id);

  const sizes = new Map<string, { w: number; h: number }>();
  const offsets = new Map<string, Point>();

  // Group sizes come from their children, laid out around the group's centre.
  const sizeOf = (id: string, seen = new Set<string>()): { w: number; h: number } => {
    const known = sizes.get(id);
    if (known) return known;
    const el = byId.get(id);
    if (!el || seen.has(id)) return { w: 0, h: 0 };
    seen.add(id);
    if (el.shape !== "group") {
      const s = intrinsicSize(el);
      sizes.set(id, s);
      return s;
    }
    const kids = el.children.map((c) => ({ id: c, size: sizeOf(c, seen) }));
    const gap = el.gap ?? 0.4;
    const layout = el.layout ?? "row";
    let w = 0;
    let h = 0;
    if (layout === "row") {
      w = kids.reduce((s, k) => s + k.size.w, 0) + gap * (kids.length - 1);
      h = Math.max(...kids.map((k) => k.size.h));
      let x = -w / 2;
      for (const k of kids) {
        offsets.set(k.id, [x + k.size.w / 2, 0]);
        x += k.size.w + gap;
      }
    } else if (layout === "column") {
      w = Math.max(...kids.map((k) => k.size.w));
      h = kids.reduce((s, k) => s + k.size.h, 0) + gap * (kids.length - 1);
      let y = h / 2;
      for (const k of kids) {
        offsets.set(k.id, [0, y - k.size.h / 2]);
        y -= k.size.h + gap;
      }
    } else if (layout === "grid") {
      const columns = el.columns ?? Math.ceil(Math.sqrt(kids.length));
      const rows = Math.ceil(kids.length / columns);
      const cw = Math.max(...kids.map((k) => k.size.w));
      const ch = Math.max(...kids.map((k) => k.size.h));
      w = columns * cw + (columns - 1) * gap;
      h = rows * ch + (rows - 1) * gap;
      kids.forEach((k, i) => offsets.set(k.id, [-w / 2 + cw / 2 + (i % columns) * (cw + gap), h / 2 - ch / 2 - Math.floor(i / columns) * (ch + gap)]));
    } else {
      // "none": children keep their own placements; the group spans them later.
      w = 0;
      h = 0;
    }
    const s = { w, h };
    sizes.set(id, s);
    return s;
  };
  for (const el of scene.elements) sizeOf(el.id);

  const boxes = new Map<string, Box>();
  const axes = new Map<string, AxesFrame>();
  const plots = new Map<string, Point[]>();
  const outlines = new Map<string, { points: Point[]; closed: boolean }>();

  const frameFor = (axesId: string): AxesFrame | undefined => {
    const existing = axes.get(axesId);
    if (existing) return existing;
    const el = byId.get(axesId);
    if (!el || el.shape !== "axes") return undefined;
    const box = boxOf(axesId);
    const [x0, x1] = el.x;
    const [y0, y1] = el.y;
    const frame: AxesFrame = {
      box,
      x: el.x,
      y: el.y,
      toCanvas: (x, y) => [box.x - box.w / 2 + ((x - x0) / (x1 - x0 || 1)) * box.w, box.y - box.h / 2 + ((y - y0) / (y1 - y0 || 1)) * box.h],
    };
    axes.set(axesId, frame);
    return frame;
  };

  const plotFormulaY = (plotId: string, x: number): number => {
    const el = byId.get(plotId);
    if (!el || el.shape !== "plot") return NaN;
    try {
      return evaluate(compile(el.y), { x });
    } catch {
      return NaN;
    }
  };

  const resolving = new Set<string>();
  /** The centre of an element, resolving placements (and groups) first. */
  function centerOf(id: string): Point {
    const known = boxes.get(id);
    if (known) return [known.x, known.y];
    const el = byId.get(id);
    if (!el || resolving.has(id)) return [0, 0];
    resolving.add(id);
    let c: Point = [0, 0];
    const groupId = parent.get(id);
    const group = groupId ? byId.get(groupId) : undefined;
    if (group && group.shape === "group" && (group.layout ?? "row") !== "none") {
      const g = centerOf(groupId!);
      const o = offsets.get(id) ?? [0, 0];
      c = [g[0] + o[0], g[1] + o[1]];
    } else if (el.at) c = place(el.at, sizeOf(id));
    resolving.delete(id);
    return c;
  }

  function place(at: NonNullable<SceneElement["at"]>, size: { w: number; h: number }): Point {
    if (Array.isArray(at)) return [at[0], at[1]];
    if ("of" in at) {
      const other = boxOf(at.of);
      const gap = at.gap ?? 0.3;
      switch (at.side ?? "below") {
        case "above":
          return [other.x, other.y + other.h / 2 + gap + size.h / 2];
        case "below":
          return [other.x, other.y - other.h / 2 - gap - size.h / 2];
        case "left":
          return [other.x - other.w / 2 - gap - size.w / 2, other.y];
        case "right":
          return [other.x + other.w / 2 + gap + size.w / 2, other.y];
        default:
          return [other.x, other.y];
      }
    }
    const frame = frameFor(at.axes);
    if (!frame) return [0, 0];
    const y = at.y ?? (at.plot ? plotFormulaY(at.plot, at.x) : 0);
    return frame.toCanvas(at.x, Number.isFinite(y) ? y : 0);
  }

  function boxOf(id: string): Box {
    const known = boxes.get(id);
    if (known) return known;
    const el = byId.get(id);
    if (!el) return { x: 0, y: 0, w: 0, h: 0 };
    let box: Box;
    if (el.shape === "line" || el.shape === "arrow") {
      const [a, b] = lineEnds(el.from, el.to);
      box = bounds([a, b]);
      outlines.set(id, { points: [a, b], closed: false });
    } else if (el.shape === "curve") {
      const points = smoothCurve(el.points as Point[]);
      box = bounds(points);
      outlines.set(id, { points, closed: !!el.closed });
    } else if (el.shape === "brace") {
      const points = bracePoints(el.from as Point, el.to as Point);
      box = bounds(points);
      outlines.set(id, { points, closed: false });
    } else if (el.shape === "plot") {
      const frame = frameFor(el.axes);
      const points: Point[] = [];
      if (frame) {
        const [d0, d1] = el.domain ?? [frame.x[0], frame.x[1]];
        const lo = Math.max(d0, frame.x[0]);
        const hi = Math.min(d1, frame.x[1]);
        const tree = compile(el.y);
        for (let i = 0; i <= 240; i++) {
          const x = lo + ((hi - lo) * i) / 240;
          let y = NaN;
          try {
            y = evaluate(tree, { x });
          } catch {
            y = NaN;
          }
          // Off the axes: a break in the curve.
          points.push(Number.isFinite(y) && y >= frame.y[0] - 1e-9 && y <= frame.y[1] + 1e-9 ? frame.toCanvas(x, y) : [NaN, NaN]);
        }
      }
      plots.set(id, points);
      const finite = points.filter((p) => Number.isFinite(p[0]));
      outlines.set(id, { points: finite, closed: false });
      box = bounds(finite);
    } else if (el.shape === "polygon" && el.points && !el.at && !parent.has(id)) {
      // Points given without a placement are where they say they are.
      box = bounds(el.points as Point[]);
      let points = el.points as Point[];
      if (el.rotate) points = points.map((p) => rotatePoint(p, [box.x, box.y], el.rotate!));
      outlines.set(id, { points, closed: true });
      boxes.set(id, box);
      return box;
    } else if (el.shape === "group" && (el.layout ?? "row") === "none") {
      const kids = el.children.map((c) => boxOf(c));
      const pts = kids.flatMap((k) => [[k.x - k.w / 2, k.y - k.h / 2], [k.x + k.w / 2, k.y + k.h / 2]] as Point[]);
      box = bounds(pts);
    } else {
      const [x, y] = centerOf(id);
      const s = sizeOf(id);
      box = { x, y, w: s.w, h: s.h };
    }
    boxes.set(id, box);
    const outline = shapeOutline(el, box);
    if (outline) outlines.set(id, outline);
    return box;
  }

  function lineEnds(from: string | readonly [number, number], to: string | readonly [number, number]): [Point, Point] {
    const center = (e: string | readonly [number, number]): Point => (typeof e === "string" ? (() => {
      const b = boxOf(e);
      return [b.x, b.y] as Point;
    })() : [e[0], e[1]]);
    const a = center(from);
    const b = center(to);
    const edge = (e: string | readonly [number, number], toward: Point): Point => {
      if (typeof e !== "string") return [e[0], e[1]];
      const other = byId.get(e);
      const round = other?.shape === "circle" || other?.shape === "dot" || other?.shape === "ellipse";
      const p = boxEdge(boxOf(e), toward, round);
      // A small gap so arrowheads don't touch what they point at.
      const dx = toward[0] - p[0];
      const dy = toward[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / len) * 0.1, p[1] + (dy / len) * 0.1];
    };
    return [edge(from, b), edge(to, a)];
  }

  for (const el of scene.elements) boxOf(el.id);
  return { canvas, boxes, outlines, axes, plots, parent, byId };
}

/** Outline points for closed and open shapes, positioned and with their base rotation applied. */
function shapeOutline(el: SceneElement, box: Box): { points: Point[]; closed: boolean } | null {
  let points: Point[];
  let closed = true;
  switch (el.shape) {
    case "rect":
      points = rectPoints(box.x, box.y, box.w, box.h, el.radius ?? 0);
      break;
    case "circle":
    case "dot":
      points = circlePoints(box.x, box.y, box.w / 2);
      break;
    case "ellipse":
      points = circlePoints(box.x, box.y, el.rx, el.ry);
      break;
    case "polygon":
      points = el.points ? (el.points as Point[]).map(([x, y]) => [box.x + x, box.y + y] as Point) : regularPolygon(box.x, box.y, el.r ?? 1, el.sides ?? 3);
      break;
    case "arc":
      points = circlePoints(box.x, box.y, el.r, el.r, el.start, el.end);
      closed = false;
      break;
    default:
      return null;
  }
  if (el.rotate) points = points.map((p) => rotatePoint(p, [box.x, box.y], el.rotate!));
  return { points, closed };
}
