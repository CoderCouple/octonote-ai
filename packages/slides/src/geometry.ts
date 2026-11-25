/**
 * Box geometry for the slide editor: resize handles, rotation and snapping.
 * The same tested maths as Octonote's canvas (@octonote/octodraw,
 * canvas/model.ts), kept here so slides don't load the canvas library.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const centerOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/** `p` turned clockwise by `degrees` about `c`. */
export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  if (!degrees) return { x: p.x, y: p.y };
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Corners of a box turned by `degrees` about its centre (clockwise from top-left). */
export function rotatedCorners(box: Box, degrees: number): Point[] {
  const c = centerOf(box);
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => rotatePoint(p, c, degrees));
}

export function rotatedBounds(box: Box, degrees: number): Box {
  const pts = rotatedCorners(box, degrees);
  const x = Math.min(...pts.map((p) => p.x));
  const y = Math.min(...pts.map((p) => p.y));
  return { x, y, w: Math.max(...pts.map((p) => p.x)) - x, h: Math.max(...pts.map((p) => p.y)) - y };
}

export const normalizeAngle = (degrees: number) => {
  const a = ((degrees % 360) + 360) % 360;
  return Math.abs(a - 360) < 1e-9 ? 0 : a;
};

/** Bounds of boxes as drawn: rotated ones count with their rotated outline. */
export function boundsOf(input: (Box & { rotate?: number })[]): Box | undefined {
  if (input.length === 0) return undefined;
  const boxes = input.map((b) => (b.rotate ? rotatedBounds(b, b.rotate) : b));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Normalizes a box drawn from one corner to another. */
export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Box after dragging a resize handle by (dx, dy); `keepRatio` holds the aspect ratio. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, keepRatio = false, min = 8): Box {
  let { x, y, w, h } = box;
  if (handle.includes("e")) w += dx;
  if (handle.includes("s")) h += dy;
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (keepRatio && box.w > 0 && box.h > 0) {
    const ratio = box.w / box.h;
    const horizontal = handle === "e" || handle === "w";
    const vertical = handle === "n" || handle === "s";
    if (horizontal || (!vertical && Math.abs(w / box.w) >= Math.abs(h / box.h))) h = w / ratio;
    else w = h * ratio;
    if (handle.includes("n")) y = box.y + box.h - h;
    if (handle.includes("w")) x = box.x + box.w - w;
    if (vertical) x = box.x + (box.w - w) / 2;
    if (horizontal) y = box.y + (box.h - h) / 2;
  }
  // Clamp to a minimum size, keeping the opposite edge in place.
  if (w < min) {
    if (handle.includes("w")) x -= min - w;
    w = min;
  }
  if (h < min) {
    if (handle.includes("n")) y -= min - h;
    h = min;
  }
  return { x, y, w, h };
}

/**
 * Resize for a rotated box: the handle drag is measured in the box's own
 * frame and the opposite side stays put on screen.
 */
export function resizeRotatedBox(box: Box, degrees: number, handle: Handle, dx: number, dy: number, keepRatio = false, min = 8): Box {
  if (!degrees) return resizeBox(box, handle, dx, dy, keepRatio, min);
  const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -degrees);
  const next = resizeBox(box, handle, local.x, local.y, keepRatio, min);
  const shift = rotatePoint({ x: next.x + next.w / 2 - (box.x + box.w / 2), y: next.y + next.h / 2 - (box.y + box.h / 2) }, { x: 0, y: 0 }, degrees);
  const cx = box.x + box.w / 2 + shift.x;
  const cy = box.y + box.h / 2 + shift.y;
  return { x: cx - next.w / 2, y: cy - next.h / 2, w: next.w, h: next.h };
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** Guide lines to draw: vertical lines at x, horizontal lines at y, each spanning the aligned boxes. */
  guides: { x?: { at: number; from: number; to: number }; y?: { at: number; from: number; to: number } };
}

/** Nudges `box` so an edge or centre lines up with another box's edge or centre within `threshold`. */
export function snapBox(box: Box, others: Box[], threshold: number, axes: { x?: boolean; y?: boolean } = { x: true, y: true }): SnapResult {
  const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];
  let best = { x: { d: threshold + 1, at: 0, other: undefined as Box | undefined }, y: { d: threshold + 1, at: 0, other: undefined as Box | undefined } };
  for (const other of others) {
    if (axes.x !== false)
      for (const a of xs(box))
        for (const b of xs(other)) {
          const d = b - a;
          if (Math.abs(d) < Math.abs(best.x.d)) best.x = { d, at: b, other };
        }
    if (axes.y !== false)
      for (const a of ys(box))
        for (const b of ys(other)) {
          const d = b - a;
          if (Math.abs(d) < Math.abs(best.y.d)) best.y = { d, at: b, other };
        }
  }
  const result: SnapResult = { dx: 0, dy: 0, guides: {} };
  if (best.x.other && Math.abs(best.x.d) <= threshold) {
    result.dx = best.x.d;
    const o = best.x.other;
    result.guides.x = { at: best.x.at, from: Math.min(box.y, o.y), to: Math.max(box.y + box.h, o.y + o.h) };
  }
  if (best.y.other && Math.abs(best.y.d) <= threshold) {
    result.dy = best.y.d;
    const o = best.y.other;
    result.guides.y = { at: best.y.at, from: Math.min(box.x + result.dx, o.x), to: Math.max(box.x + result.dx + box.w, o.x + o.w) };
  }
  return result;
}

/** The cursor for a resize handle, turned with the box (8 compass directions). */
export function resizeCursor(handle: Handle, rotate = 0): string {
  const order: Handle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const turned = order[(order.indexOf(handle) + Math.round(normalizeAngle(rotate) / 45)) % 8]!;
  return { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" }[turned];
}
