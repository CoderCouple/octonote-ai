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
 * box links to (mermaid `click`, tldraw geo `url`).
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
}

export interface LineItem extends ItemBase {
  type: "line";
  start: Endpoint;
  end: Endpoint;
  startArrow?: boolean;
  endArrow?: boolean;
  dashed?: boolean;
  text?: string;
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
function outlinePoint(item: CanvasItem, toward: Point, gap = 4): Point {
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

/**
 * Settles attached line ends the way octodraw's `resolveLines` does (ends on
 * their item's outline, aimed at the other end; line box = its two ends), so
 * a stored document is already in the state the editor would put it in.
 */
export function settleLines(items: CanvasItem[]): CanvasItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((item) => {
    if (item.type !== "line") return item;
    const s = item.start.item ? byId.get(item.start.item) : undefined;
    const t = item.end.item ? byId.get(item.end.item) : undefined;
    const start: Endpoint = s ? { ...item.start, ...outlinePoint(s, t ? centerOf(t) : item.end) } : item.start;
    const end: Endpoint = t ? { ...item.end, ...outlinePoint(t, s ? centerOf(s) : item.start) } : item.end;
    return {
      ...item,
      start,
      end,
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  });
}
