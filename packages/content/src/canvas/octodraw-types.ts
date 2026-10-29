/**
 * The octodraw canvas document (`CanvasDocument` in
 * packages/octodraw/src/canvas/model.ts), mirrored here as plain types.
 *
 * Why a copy: this package compiles to CommonJS with tsc for the API, and
 * @octonote/octodraw ships TypeScript source (ESM, React). Importing even its
 * types would pull its sources into this build. Keep these in step with
 * model.ts — `octodraw-compat.test.ts` runs our output through octodraw's
 * own model functions to catch drift.
 *
 * octodraw-side extension (not yet in model.ts): `link` on items — the URL a
 * box links to (mermaid `click`).
 *
 * Optional style fields (bend, anchor, align/valign, dashed, fill);
 * octodraw treats a missing field as its default
 * (straight, centre-aimed, centred text, solid stroke, tinted fill). The line
 * maths below mirrors model.ts (`anchorPoint`, `anchoredEnd`, `bendControl`,
 * `lineGeometry`, `lineBounds`); flowchart-to-octodraw.test.ts checks
 * straight lines against the real functions.
 */

export type ShapeKind = "rectangle" | "ellipse" | "diamond";

interface ItemBase {
  id: string;
  /** Top-left corner and size in canvas units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Palette color name (blue, green, …) or a hex value; undefined = theme default. */
  color?: string;
  locked?: boolean;
  /** Clockwise rotation in degrees about the box centre (never on lines or figures). */
  rotation?: number;
  /** Where the item links to (http(s) only). Proposed octodraw extension. */
  link?: string;
}

export interface ShapeItem extends ItemBase {
  type: "shape";
  shape: ShapeKind;
  text?: string;
  /** Label placement inside the box; undefined = center / middle. */
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  dashed?: boolean;
  /** undefined = "tint" (a soft fill in the shape's color). */
  fill?: "tint" | "none" | "solid";
}

export interface TextItem extends ItemBase {
  type: "text";
  text: string;
  fontSize: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
}

export interface StickyItem extends ItemBase {
  type: "sticky";
  text: string;
}

export interface ImageItem extends ItemBase {
  type: "image";
  src: string;
  alt?: string;
}

export type DeviceKind = "phone" | "tablet" | "browser" | "desktop";

export interface FrameItem extends ItemBase {
  type: "frame";
  device: DeviceKind;
  title?: string;
}

export interface CodeItem extends ItemBase {
  type: "code";
  text: string;
  language?: string;
}

export interface PenItem extends ItemBase {
  type: "pen";
  /** Points normalized to the item box (0–1). */
  points: [number, number][];
}

export interface Endpoint {
  x: number;
  y: number;
  /** Item this end is attached to; it then follows the item. */
  item?: string;
  /** Normalized (0–1) point in the attached item's box the line aims at; undefined = its centre. */
  anchor?: Point;
}

export interface LineItem extends ItemBase {
  type: "line";
  start: Endpoint;
  end: Endpoint;
  startArrow?: boolean;
  endArrow?: boolean;
  dashed?: boolean;
  text?: string;
  /**
   * Signed distance (canvas units) from the chord midpoint to the curve
   * midpoint, along n = (−dy, dx)/len with (dx, dy) = end − start. Drawn as a
   * quadratic with control point mid + 2·bend·n. undefined/0 = straight.
   */
  bend?: number;
}

export interface IconItem extends ItemBase {
  type: "icon";
  name: string;
}

export interface FigureItem extends ItemBase {
  type: "figure";
  source: string;
  autoSize?: boolean;
  placements?: unknown;
}

export type CanvasItem =
  | ShapeItem
  | TextItem
  | StickyItem
  | PenItem
  | LineItem
  | IconItem
  | ImageItem
  | FrameItem
  | CodeItem
  | FigureItem;

export interface CanvasDocument {
  version: 1;
  items: CanvasItem[];
  comments?: unknown[];
  presentation?: { order?: string[]; hidden?: string[]; notes?: Record<string, string> };
}

export interface Point {
  x: number;
  y: number;
}

export const emptyOctodrawDocument = (): CanvasDocument => ({ version: 1, items: [] });

// ---- small geometry helpers, same maths as octodraw's model.ts ----

const centerOf = (b: { x: number; y: number; w: number; h: number }): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function rotatePoint(p: Point, c: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Where the segment from the item's centre towards `toward` leaves its outline (octodraw's `outlinePoint`). */
export function outlinePoint(item: CanvasItem, toward: Point, gap = 4): Point {
  const c = centerOf(item);
  if (item.rotation) {
    return rotatePoint(outlinePoint({ ...item, rotation: 0 }, rotatePoint(toward, c, -item.rotation), gap), c, item.rotation);
  }
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = item.w / 2 + gap;
  const hh = item.h / 2 + gap;
  let t: number;
  if (item.type === "shape" && item.shape === "ellipse") t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
  else if (item.type === "shape" && item.shape === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) };
}

/** An anchor (0–1 in the item's unrotated box, clamped) as a canvas point (octodraw's `anchorPoint`). */
export function anchorPoint(item: { x: number; y: number; w: number; h: number; rotation?: number }, anchor: Point): Point {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);
  const p = { x: item.x + clamp(anchor.x) * item.w, y: item.y + clamp(anchor.y) * item.h };
  return item.rotation ? rotatePoint(p, centerOf(item), item.rotation) : p;
}

/** Whether a point is inside the item's outline grown by `gap` (tested in the item's unrotated frame). */
function insideOutline(item: CanvasItem, p: Point, gap: number): boolean {
  const c = centerOf(item);
  const q = item.rotation ? rotatePoint(p, c, -item.rotation) : p;
  const dx = Math.abs(q.x - c.x);
  const dy = Math.abs(q.y - c.y);
  const hw = item.w / 2 + gap;
  const hh = item.h / 2 + gap;
  if (item.type === "shape" && item.shape === "ellipse") return (dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1;
  if (item.type === "shape" && item.shape === "diamond") return dx / hw + dy / hh <= 1;
  return dx <= hw && dy <= hh;
}

/**
 * The end of a line attached at `anchor` (a canvas point) and coming from
 * `from`: where the segment from → anchor enters the outline (grown by
 * `gap`) when the anchor is inside it and `from` is outside; otherwise the
 * anchor itself (octodraw's `anchoredEnd`).
 */
export function anchoredEnd(item: CanvasItem, anchor: Point, from: Point, gap = 4): Point {
  if (!insideOutline(item, anchor, gap) || insideOutline(item, from, gap)) return { x: anchor.x, y: anchor.y };
  let lo = 0;
  let hi = 1;
  const at = (t: number) => ({ x: from.x + (anchor.x - from.x) * t, y: from.y + (anchor.y - from.y) * t });
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    if (insideOutline(item, at(t), gap)) hi = t;
    else lo = t;
  }
  return at(hi);
}

/** Control point of a bent line: mid + 2·bend·n, n = (−dy, dx)/len (undefined when straight). */
export function bendControl(start: Point, end: Point, bend: number | undefined): Point | undefined {
  if (!bend || !Number.isFinite(bend)) return undefined;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (!len) return undefined;
  return { x: (start.x + end.x) / 2 - (2 * bend * dy) / len, y: (start.y + end.y) / 2 + (2 * bend * dx) / len };
}

/** Bounds of a line between two points, including its curve (octodraw's `lineBounds`). */
export function lineBounds(start: Point, end: Point, bend: number | undefined): { x: number; y: number; w: number; h: number } {
  const control = bendControl(start, end, bend);
  const xs = [start.x, end.x];
  const ys = [start.y, end.y];
  if (control) {
    // Extremes of a quadratic Bézier per axis: t = (p0 − p1) / (p0 − 2p1 + p2).
    for (const axis of ["x", "y"] as const) {
      const d = start[axis] - 2 * control[axis] + end[axis];
      if (!d) continue;
      const t = (start[axis] - control[axis]) / d;
      if (t > 0 && t < 1) {
        const u = 1 - t;
        xs.push(u * u * start.x + 2 * u * t * control.x + t * t * end.x);
        ys.push(u * u * start.y + 2 * u * t * control.y + t * t * end.y);
      }
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The drawn ends of a line (octodraw's `lineEnds` / `lineGeometry`): an
 * attached end sits on its item's outline aimed at the other end (its anchor
 * or item centre); with an `anchor`, where that segment enters the outline
 * (`anchoredEnd`). On a bent line attached ends aim at the control point
 * instead, refined in two passes.
 */
export function lineEnds(line: LineItem, byId: Map<string, CanvasItem>): { start: Point; end: Point } {
  const target = (e: Endpoint) => (e.item ? byId.get(e.item) : undefined);
  const s = target(line.start);
  const t = target(line.end);
  const aim = (e: Endpoint, item: CanvasItem | undefined): Point => (!item ? { x: e.x, y: e.y } : e.anchor ? anchorPoint(item, e.anchor) : centerOf(item));
  const place = (e: Endpoint, item: CanvasItem | undefined, from: Point): Point =>
    !item ? { x: e.x, y: e.y } : e.anchor ? anchoredEnd(item, anchorPoint(item, e.anchor), from) : outlinePoint(item, from);
  let start = place(line.start, s, aim(line.end, t));
  let end = place(line.end, t, aim(line.start, s));
  let control = bendControl(start, end, line.bend);
  if (control && (s || t)) {
    for (let i = 0; i < 2; i++) {
      start = place(line.start, s, control);
      end = place(line.end, t, control);
      control = bendControl(start, end, line.bend) ?? control;
    }
  }
  return { start, end };
}

/**
 * Settles line ends the way octodraw's `resolveLines` does (see `lineEnds`;
 * line box = `lineBounds`, curve included), so a stored document is already
 * in the state the editor would put it in. Free lines keep their ends but
 * get their box too (octodraw never recomputes those).
 */
export function settleLines(items: CanvasItem[]): CanvasItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((item) => {
    if (item.type !== "line") return item;
    const ends = lineEnds(item, byId);
    const start: Endpoint = { ...item.start, ...ends.start };
    const end: Endpoint = { ...item.end, ...ends.end };
    return { ...item, start, end, ...lineBounds(start, end, item.bend) };
  });
}
