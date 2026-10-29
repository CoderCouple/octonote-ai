import type { ViewPlacements } from '../layout/arrange';

// The free-form canvas document: a flat, ordered list of items (later items
// draw on top). Plain JSON, edited only through the pure functions below, so
// it can be stored by the host and synced (e.g. with Yjs) later.

export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond';

interface ItemBase {
  id: string;
  /** Top-left corner and size in canvas units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Palette color name (blue, green, …) or a hex value; undefined uses the theme's default ink. */
  color?: string;
  locked?: boolean;
  /** Clockwise rotation in degrees about the box centre (never set on lines or figures). */
  rotation?: number;
  /** http(s) link the item opens (e.g. a mermaid `click` target); see `safeLink`. */
  link?: string;
}

/** The item's link if it is a plain http(s) URL, else undefined (never javascript: etc.). */
export function safeLink(item: { link?: string }): string | undefined {
  const link = item.link?.trim();
  return link && /^https?:\/\//i.test(link) ? link : undefined;
}

export type ShapeFill = 'tint' | 'none' | 'solid';
export type HorizontalAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface ShapeItem extends ItemBase {
  type: 'shape';
  shape: ShapeKind;
  text?: string;
  /** Label placement inside the shape (default center / middle). */
  align?: HorizontalAlign;
  valign?: VerticalAlign;
  /** Dashed outline (the same dash lines use). */
  dashed?: boolean;
  /** 'tint' (default): the color's pale fill; 'none': outline only; 'solid': the color's strong fill. */
  fill?: ShapeFill;
}

export interface TextItem extends ItemBase {
  type: 'text';
  text: string;
  fontSize: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** A sticky note: a square of colored paper with text (yellow by default). */
export interface StickyItem extends ItemBase {
  type: 'sticky';
  text: string;
}

export interface ImageItem extends ItemBase {
  type: 'image';
  /** URL or data URL; hosts may upload pasted images and store the returned URL. */
  src: string;
  alt?: string;
}

export type DeviceKind = 'phone' | 'tablet' | 'browser' | 'desktop';

/** A device outline (phone, tablet, browser window, monitor) to sketch screens in. */
export interface FrameItem extends ItemBase {
  type: 'frame';
  device: DeviceKind;
  title?: string;
}

export interface CodeItem extends ItemBase {
  type: 'code';
  text: string;
  language?: string;
}

export interface PenItem extends ItemBase {
  type: 'pen';
  /** Points normalized to the item box (0–1), so resizing scales the stroke. */
  points: [number, number][];
}

export interface Endpoint {
  /** Free point in canvas units, used when the end isn't attached to an item. */
  x: number;
  y: number;
  /** Item this end is attached to; it then follows the item. */
  item?: string;
  /**
   * With `item`: the point (0–1 in the item's unrotated box) the line aims at
   * instead of the item's centre. The end sits where the line toward it enters
   * the outline, or at the anchor itself when it lies on/outside the outline.
   */
  anchor?: Point;
}

export interface LineItem extends ItemBase {
  type: 'line';
  start: Endpoint;
  end: Endpoint;
  startArrow?: boolean;
  endArrow?: boolean;
  dashed?: boolean;
  text?: string;
  /**
   * Curvature: signed distance (canvas units) from the chord midpoint to the
   * curve's midpoint along n = (−dy, dx)/len, (dx, dy) = end − start. Drawn as a
   * quadratic Bézier with control point mid + 2·bend·n. 0 / undefined = straight.
   */
  bend?: number;
}

export interface IconItem extends ItemBase {
  type: 'icon';
  name: string;
}

export interface FigureItem extends ItemBase {
  type: 'figure';
  /** Diagram-as-code source. */
  source: string;
  /** Size follows the diagram's natural size until the user resizes the figure. */
  autoSize?: boolean;
  /** Nodes the user moved or resized inside the diagram, per drill-down level. */
  placements?: ViewPlacements;
}

export type CanvasItem = ShapeItem | TextItem | StickyItem | PenItem | LineItem | IconItem | ImageItem | FrameItem | CodeItem | FigureItem;
export type CanvasItemType = CanvasItem['type'];

export interface CommentAuthor {
  id: string;
  name: string;
}

export interface CommentMessage {
  id: string;
  author: CommentAuthor;
  text: string;
  /** Epoch milliseconds. */
  at: number;
  /** Ids of the people @mentioned in the text. */
  mentions?: string[];
}

/** People mentioned in a message: those picked from the list whose "@Name" is still in the text. */
export function mentionsIn(text: string, candidates: CommentAuthor[]): CommentAuthor[] {
  return candidates.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i && text.includes(`@${p.name}`));
}

/** A comment thread pinned to an item (offset from its top-left) or to a canvas point. */
export interface CommentThread {
  id: string;
  item?: string;
  x: number;
  y: number;
  messages: CommentMessage[];
  resolved?: boolean;
}

/** Another person on the canvas (from the host's presence system, e.g. Yjs awareness). */
export interface CanvasPeer {
  /** Stable per connection (e.g. the Yjs client id). */
  clientId: number | string;
  id: string;
  name: string;
  color: string;
  /** Pointer position in canvas units, or null when it's off the canvas. */
  cursor?: Point | null;
  selection?: string[];
  /** The part of the canvas they can see (for "follow"). */
  view?: Box;
  /** The user id they're following, if any (so two people don't follow each other). */
  following?: string | null;
  /** When they started following (epoch ms): of two people following each other, the later one wins. */
  followingSince?: number;
  /** Pointing with the laser pointer while presenting. */
  laser?: boolean;
  /** Where they are in a text editor the host shows (e.g. a figure's code): offsets into that text. */
  code?: { item: string; anchor: number; head: number } | null;
}

/** How the canvas is presented: slide order (item ids), slides left out, speaker notes per slide. */
export interface PresentationSettings {
  order?: string[];
  hidden?: string[];
  notes?: Record<string, string>;
}

export interface CanvasDocument {
  version: 1;
  items: CanvasItem[];
  comments?: CommentThread[];
  presentation?: PresentationSettings;
}

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

export const emptyDocument = (): CanvasDocument => ({ version: 1, items: [] });

let counter = 0;
/** Short unique ids; time-based prefix keeps ids from different sessions apart. */
export function newItemId(): string {
  return `${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function getItem(doc: CanvasDocument, id: string): CanvasItem | undefined {
  return doc.items.find((item) => item.id === id);
}

export function addItems(doc: CanvasDocument, items: CanvasItem[]): CanvasDocument {
  return { ...doc, items: [...doc.items, ...items] };
}

type Patch<T> = Partial<Omit<T, 'type' | 'id'>>;
export type ItemPatch = Patch<ShapeItem> & Patch<TextItem> & Patch<StickyItem> & Patch<PenItem> & Patch<LineItem> & Patch<IconItem> & Patch<ImageItem> & Patch<FrameItem> & Patch<CodeItem> & Patch<FigureItem>;

export function updateItem(doc: CanvasDocument, id: string, patch: ItemPatch): CanvasDocument {
  return { ...doc, items: doc.items.map((item) => (item.id === id ? ({ ...item, ...patch } as CanvasItem) : item)) };
}

/** Removes items (and comments pinned to them); lines attached to them keep their last position as a free end. */
export function removeItems(doc: CanvasDocument, ids: Iterable<string>): CanvasDocument {
  const gone = new Set(ids);
  const comments = doc.comments?.filter((c) => !c.item || !gone.has(c.item));
  const items = doc.items
    .filter((item) => !gone.has(item.id))
    .map((item) => {
      if (item.type !== 'line') return item;
      const detach = (end: Endpoint): Endpoint => {
        if (!end.item || !gone.has(end.item)) return end;
        const target = getItem(doc, end.item);
        return target ? centerOf(target) : { x: end.x, y: end.y };
      };
      const start = detach(item.start);
      const end = detach(item.end);
      return start === item.start && end === item.end ? item : withLineBox({ ...item, start, end });
    });
  return comments ? { ...doc, items, comments } : { ...doc, items };
}

/** Moves items by (dx, dy); free line ends move with their line. */
export function moveItems(doc: CanvasDocument, ids: Iterable<string>, dx: number, dy: number): CanvasDocument {
  const moving = new Set(ids);
  const items = doc.items.map((item) => {
    if (!moving.has(item.id) || item.locked) return item;
    if (item.type === 'line') {
      const shift = (e: Endpoint): Endpoint => (e.item && moving.has(e.item) ? e : e.item ? e : { ...e, x: e.x + dx, y: e.y + dy });
      return { ...item, x: item.x + dx, y: item.y + dy, start: shift(item.start), end: shift(item.end) };
    }
    return { ...item, x: item.x + dx, y: item.y + dy };
  });
  return resolveLines({ ...doc, items });
}

export type LayerMove = 'front' | 'forward' | 'backward' | 'back';

/** Changes the stacking order of the given items, keeping their relative order. */
export function reorderItems(doc: CanvasDocument, ids: Iterable<string>, move: LayerMove): CanvasDocument {
  const set = new Set(ids);
  const items = [...doc.items];
  if (move === 'front' || move === 'back') {
    const picked = items.filter((i) => set.has(i.id));
    const rest = items.filter((i) => !set.has(i.id));
    return { ...doc, items: move === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
  }
  // One step: swap each selected item with its neighbour, scanning against the direction of travel.
  const step = move === 'forward' ? 1 : -1;
  const order = items.map((_, i) => i);
  if (step > 0) order.reverse();
  for (const i of order) {
    const j = i + step;
    if (!set.has(items[i]!.id) || j < 0 || j >= items.length || set.has(items[j]!.id)) continue;
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return { ...doc, items };
}

/** Copies of the given items with new ids, offset by (dx, dy); links between copied items are kept. */
export function cloneItems(items: CanvasItem[], dx = 0, dy = 0): CanvasItem[] {
  const ids = new Map(items.map((item) => [item.id, newItemId()]));
  return items.map((item) => {
    const copy = { ...item, id: ids.get(item.id)!, x: item.x + dx, y: item.y + dy } as CanvasItem;
    if (copy.type === 'line') {
      const remap = (e: Endpoint): Endpoint => (e.item && ids.has(e.item) ? { ...e, x: e.x + dx, y: e.y + dy, item: ids.get(e.item) } : { x: e.x + dx, y: e.y + dy });
      copy.start = remap(copy.start);
      copy.end = remap(copy.end);
    }
    return copy;
  });
}

/**
 * Copies of a clipboard document's items (new ids, offset) and of the comment
 * threads pinned to them, re-pinned to the copies (so cut and paste keeps comments).
 */
export function cloneWithComments(source: CanvasDocument, dx = 0, dy = 0): { items: CanvasItem[]; comments: CommentThread[] } {
  const items = cloneItems(source.items, dx, dy);
  const ids = new Map(source.items.map((item, i) => [item.id, items[i]!.id]));
  const comments = (source.comments ?? [])
    .filter((t) => t.item && ids.has(t.item))
    .map((t) => ({ ...t, id: newItemId(), item: ids.get(t.item!)!, messages: t.messages.map((m) => ({ ...m, id: newItemId() })) }));
  return { items, comments };
}

export function duplicateItems(doc: CanvasDocument, ids: Iterable<string>, offset = 24): { doc: CanvasDocument; ids: string[] } {
  const set = new Set(ids);
  const copies = cloneItems(
    doc.items.filter((item) => set.has(item.id)),
    offset,
    offset,
  );
  return { doc: resolveLines(addItems(doc, copies)), ids: copies.map((c) => c.id) };
}

export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** Bounds of boxes as drawn: rotated items count with their rotated outline. */
export function boundsOf(input: (Box & { rotation?: number })[]): Box | undefined {
  if (input.length === 0) return undefined;
  const boxes = input.map((b) => (b.rotation ? rotatedBounds(b, b.rotation) : b));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function boxContains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Normalizes a box drawn from one corner to another. */
export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Where the segment from `inside` (the centre) towards `toward` leaves the item's outline. */
export function outlinePoint(item: CanvasItem, toward: Point, gap = 4): Point {
  const c = centerOf(item);
  if (item.rotation) {
    // Work in the item's own frame, then turn the result back.
    return rotatePoint(outlinePoint({ ...item, rotation: 0 }, rotatePoint(toward, c, -item.rotation), gap), c, item.rotation);
  }
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const hw = item.w / 2 + gap;
  const hh = item.h / 2 + gap;
  let t: number;
  if (item.type === 'shape' && item.shape === 'ellipse') t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
  else if (item.type === 'shape' && item.shape === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) };
}

/** An anchor (0–1 in the item's unrotated box) as a canvas point. */
export function anchorPoint(item: Box & { rotation?: number }, anchor: Point): Point {
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
  if (item.type === 'shape' && item.shape === 'ellipse') return (dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1;
  if (item.type === 'shape' && item.shape === 'diamond') return dx / hw + dy / hh <= 1;
  return dx <= hw && dy <= hh;
}

/**
 * The end of a line attached at `anchor` (a canvas point) and coming from `from`:
 * where the segment from → anchor enters the outline (grown by `gap`) when the
 * anchor is inside it and `from` is outside; otherwise the anchor itself.
 */
export function anchoredEnd(item: CanvasItem, anchor: Point, from: Point, gap = 4): Point {
  if (!insideOutline(item, anchor, gap) || insideOutline(item, from, gap)) return { x: anchor.x, y: anchor.y };
  // Outlines are convex, so the segment crosses once: bisect for the crossing.
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

/** Control point of a bent line: mid + 2·bend·n (undefined when straight). */
export function bendControl(start: Point, end: Point, bend: number | undefined): Point | undefined {
  if (!bend || !Number.isFinite(bend)) return undefined;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (!len) return undefined;
  return { x: (start.x + end.x) / 2 - (2 * bend * dy) / len, y: (start.y + end.y) / 2 + (2 * bend * dx) / len };
}

export interface LineGeometry {
  start: Point;
  end: Point;
  /** Quadratic Bézier control point; absent for straight lines. */
  control?: Point;
  /** The curve's midpoint (where the label sits). */
  mid: Point;
}

/** Point at t (0–1) along a line, straight or curved. */
export function pointOnLine(g: LineGeometry, t: number): Point {
  const u = 1 - t;
  if (!g.control) return { x: g.start.x * u + g.end.x * t, y: g.start.y * u + g.end.y * t };
  return { x: u * u * g.start.x + 2 * u * t * g.control.x + t * t * g.end.x, y: u * u * g.start.y + 2 * u * t * g.control.y + t * t * g.end.y };
}

function geometryOf(start: Point, end: Point, bend: number | undefined): LineGeometry {
  const control = bendControl(start, end, bend);
  const g: LineGeometry = { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
  if (control) {
    g.control = control;
    g.mid = pointOnLine(g, 0.5);
  }
  return g;
}

/**
 * The drawn geometry of a line. Attached ends sit on their item's outline,
 * aimed at the other end (its anchor or item centre) — or, on a bent line,
 * along the curve's end tangent (toward the control point), so arrowheads meet
 * the outline. Ends with an `anchor` aim at that point (see `anchoredEnd`).
 */
export function lineGeometry(doc: CanvasDocument, line: LineItem): LineGeometry {
  const target = (e: Endpoint) => (e.item ? getItem(doc, e.item) : undefined);
  const s = target(line.start);
  const t = target(line.end);
  const aim = (e: Endpoint, item: CanvasItem | undefined): Point => (!item ? { x: e.x, y: e.y } : e.anchor ? anchorPoint(item, e.anchor) : centerOf(item));
  const place = (e: Endpoint, item: CanvasItem | undefined, from: Point): Point => (!item ? { x: e.x, y: e.y } : e.anchor ? anchoredEnd(item, anchorPoint(item, e.anchor), from) : outlinePoint(item, from));
  let start = place(line.start, s, aim(line.end, t));
  let end = place(line.end, t, aim(line.start, s));
  let control = bendControl(start, end, line.bend);
  if (control && (s || t)) {
    // Aim attached ends at the control point; two passes settle it closely enough.
    for (let i = 0; i < 2; i++) {
      start = place(line.start, s, control);
      end = place(line.end, t, control);
      control = bendControl(start, end, line.bend) ?? control;
    }
  }
  return geometryOf(start, end, line.bend);
}

/** The drawn end points of a line (see `lineGeometry`). */
export function lineEnds(doc: CanvasDocument, line: LineItem): { start: Point; end: Point } {
  const { start, end } = lineGeometry(doc, line);
  return { start, end };
}

/** Bounds of a line between two points, including its curve. */
export function lineBounds(start: Point, end: Point, bend: number | undefined): Box {
  const g = geometryOf(start, end, bend);
  if (!g.control) return boxFromPoints(start, end);
  const xs = [start.x, end.x];
  const ys = [start.y, end.y];
  // Extremes of a quadratic Bézier per axis: t = (p0 − p1) / (p0 − 2p1 + p2).
  for (const axis of ['x', 'y'] as const) {
    const d = start[axis] - 2 * g.control[axis] + end[axis];
    if (!d) continue;
    const t = (start[axis] - g.control[axis]) / d;
    if (t > 0 && t < 1) {
      const p = pointOnLine(g, t);
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A line with its box fitted to its ends (and curve). */
export function withLineBox(line: LineItem, ends: { start: Point; end: Point } = line): LineItem {
  return { ...line, ...lineBounds(ends.start, ends.end, line.bend) };
}

/** Distance from a point to a line's drawn path (curves sampled finely). */
export function distanceToLine(p: Point, g: LineGeometry): number {
  if (!g.control) return distanceToSegment(p, g.start, g.end);
  let best = Infinity;
  let prev = g.start;
  const steps = 32;
  for (let i = 1; i <= steps; i++) {
    const next = pointOnLine(g, i / steps);
    best = Math.min(best, distanceToSegment(p, prev, next));
    prev = next;
  }
  return best;
}

/** The bend whose curve passes through `p` at its middle (measured on the straight line; |bend| < snap → straight). */
export function bendThrough(doc: CanvasDocument, line: LineItem, p: Point, snap = 4): number | undefined {
  const { start, end } = lineGeometry(doc, { ...line, bend: undefined });
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (!len) return undefined;
  const bend = ((p.x - (start.x + end.x) / 2) * -dy + (p.y - (start.y + end.y) / 2) * dx) / len;
  return Math.abs(bend) < snap ? undefined : Math.round(bend * 100) / 100;
}

/** Recomputes attached line ends (and line boxes) after items moved or resized. */
export function resolveLines(doc: CanvasDocument): CanvasDocument {
  let changed = false;
  const items = doc.items.map((item) => {
    if (item.type !== 'line' || (!item.start.item && !item.end.item)) return item;
    const ends = lineEnds(doc, item);
    const next = withLineBox({ ...item, start: { ...item.start, ...ends.start }, end: { ...item.end, ...ends.end } }, ends);
    if (next.x === item.x && next.y === item.y && next.w === item.w && next.h === item.h && next.start.x === item.start.x && next.end.x === item.end.x && next.start.y === item.start.y && next.end.y === item.end.y) return item;
    changed = true;
    return next;
  });
  return changed ? { ...doc, items } : doc;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Box after dragging a resize handle by (dx, dy); `keepRatio` holds the aspect ratio. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, keepRatio = false, min = 8): Box {
  let { x, y, w, h } = box;
  if (handle.includes('e')) w += dx;
  if (handle.includes('s')) h += dy;
  if (handle.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (handle.includes('n')) {
    y += dy;
    h -= dy;
  }
  if (keepRatio && box.w > 0 && box.h > 0) {
    const ratio = box.w / box.h;
    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';
    if (horizontal || (!vertical && Math.abs(w / box.w) >= Math.abs(h / box.h))) h = w / ratio;
    else w = h * ratio;
    if (handle.includes('n')) y = box.y + box.h - h;
    if (handle.includes('w')) x = box.x + box.w - w;
    if (vertical) x = box.x + (box.w - w) / 2;
    if (horizontal) y = box.y + (box.h - h) / 2;
  }
  // Clamp to a minimum size, keeping the opposite edge in place.
  if (w < min) {
    if (handle.includes('w')) x -= min - w;
    w = min;
  }
  if (h < min) {
    if (handle.includes('n')) y -= min - h;
    h = min;
  }
  return { x, y, w, h };
}

/** Resizes an item to a new box; figures stop following the diagram's size. */
export function resizeItem(doc: CanvasDocument, id: string, box: Box): CanvasDocument {
  const item = getItem(doc, id);
  if (!item || item.locked) return doc;
  const patch: ItemPatch = { ...box };
  if (item.type === 'figure') patch.autoSize = false;
  if (item.type === 'text') patch.fontSize = Math.max(6, Math.round(item.fontSize * (box.h / Math.max(item.h, 1))));
  return resolveLines(updateItem(doc, id, patch));
}

/** Topmost item under a point (lines are hit within `tolerance` of the segment). */
export function itemAt(doc: CanvasDocument, p: Point, tolerance = 6): CanvasItem | undefined {
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const item = doc.items[i]!;
    if (item.type === 'line') {
      if (distanceToLine(p, lineGeometry(doc, item)) <= tolerance) return item;
    } else if (item.rotation) {
      const q = rotatePoint(p, centerOf(item), -item.rotation);
      if (q.x >= item.x - tolerance && q.x <= item.x + item.w + tolerance && q.y >= item.y - tolerance && q.y <= item.y + item.h + tolerance) return item;
    } else if (p.x >= item.x - tolerance && p.x <= item.x + item.w + tolerance && p.y >= item.y - tolerance && p.y <= item.y + item.h + tolerance) {
      return item;
    }
  }
  return undefined;
}

/** Items fully inside a marquee box. */
export function itemsInBox(doc: CanvasDocument, box: Box): CanvasItem[] {
  return doc.items.filter((item) => boxContains(box, item.rotation ? rotatedBounds(item, item.rotation) : item));
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Builds a pen item from absolute points. */
export function penFromPoints(points: Point[], color?: string): PenItem {
  const box = boundsOf(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!;
  const w = Math.max(box.w, 1);
  const h = Math.max(box.h, 1);
  return { id: newItemId(), type: 'pen', x: box.x, y: box.y, w, h, color, points: points.map((p) => [(p.x - box.x) / w, (p.y - box.y) / h]) };
}

/** Builds a line between two endpoints. */
export function lineBetween(start: Endpoint, end: Endpoint, options: Partial<Pick<LineItem, 'startArrow' | 'endArrow' | 'dashed' | 'color' | 'bend'>> = {}): LineItem {
  return withLineBox({ id: newItemId(), type: 'line', x: 0, y: 0, w: 0, h: 0, start, end, endArrow: true, ...options });
}

const optional = (value: unknown, ok: (v: unknown) => boolean) => value === undefined || ok(value);
const isFiniteNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const oneOf = (values: readonly string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const isPoint = (v: unknown) => !!v && typeof v === 'object' && isFiniteNumber((v as Point).x) && isFiniteNumber((v as Point).y);

/** Checks an item's optional styling fields (the rest of an item is trusted, as before). */
function validItem(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (item.type === 'shape') {
    return optional(item.align, oneOf(['left', 'center', 'right'])) && optional(item.valign, oneOf(['top', 'middle', 'bottom'])) && optional(item.dashed, (v) => typeof v === 'boolean') && optional(item.fill, oneOf(['tint', 'none', 'solid']));
  }
  if (item.type === 'line') {
    const end = (e: unknown) => !e || typeof e !== 'object' || optional((e as Endpoint).anchor, isPoint);
    return optional(item.bend, isFiniteNumber) && end(item.start) && end(item.end);
  }
  return true;
}

/** A loose check that a value is a canvas document (for pasted or stored JSON). */
export function isCanvasDocument(value: unknown): value is CanvasDocument {
  return !!value && typeof value === 'object' && (value as CanvasDocument).version === 1 && Array.isArray((value as CanvasDocument).items) && (value as CanvasDocument).items.every(validItem);
}

// ---- snapping ----

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

// ---- group resize ----

/** Scales items from the box `from` to the box `to` (a multi-selection resize). */
export function resizeItems(doc: CanvasDocument, ids: Iterable<string>, from: Box, to: Box): CanvasDocument {
  const set = new Set(ids);
  const sx = to.w / Math.max(from.w, 1);
  const sy = to.h / Math.max(from.h, 1);
  const map = (p: Point): Point => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  const items = doc.items.map((item) => {
    if (!set.has(item.id) || item.locked) return item;
    // Scale about the centre so rotated items stay inside the new bounds.
    const center = map(centerOf(item));
    const w = item.w * sx;
    const h = item.h * sy;
    const scaled = { ...item, x: center.x - w / 2, y: center.y - h / 2, w, h } as CanvasItem;
    if (scaled.type === 'line') {
      const end = (e: Endpoint): Endpoint => (e.item ? e : { ...e, ...map(e) });
      scaled.start = end(scaled.start);
      scaled.end = end(scaled.end);
      if (scaled.bend) scaled.bend *= Math.sqrt(sx * sy);
      return withLineBox(scaled);
    }
    if (scaled.type === 'text') scaled.fontSize = Math.max(6, Math.round((item as TextItem).fontSize * Math.min(sx, sy)));
    if (scaled.type === 'figure') scaled.autoSize = false;
    return scaled;
  });
  return resolveLines({ ...doc, items });
}

// ---- selection → diagram code ----

const quoteName = (name: string) => (/[[\]{}:,<>]|\s-\s|^\s|\s$/.test(name) ? `"${name.replace(/"/g, "'")}"` : name);

/**
 * Diagram code for a hand-drawn selection: shapes, sticky notes and icons become
 * nodes, lines attached at both ends to them become connections.
 */
export function selectionToSource(doc: CanvasDocument, ids: Iterable<string>): string {
  const set = new Set(ids);
  const picked = doc.items.filter((i) => set.has(i.id));
  const names = new Map<string, string>();
  const used = new Set<string>();
  const unique = (base: string) => {
    let name = base.replace(/\s+/g, ' ').trim() || 'Box';
    for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
    used.add(name);
    return name;
  };
  const lines: string[] = [];
  // Reading order: top to bottom, then left to right.
  const nodes = picked.filter((i) => i.type === 'shape' || i.type === 'sticky' || i.type === 'icon' || i.type === 'text').sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of nodes) {
    const label = item.type === 'icon' ? item.name : item.type === 'shape' ? (item.text ?? '') : (item as TextItem | StickyItem).text;
    const name = unique(label || (item.type === 'shape' ? item.shape[0]!.toUpperCase() + item.shape.slice(1) : 'Note'));
    names.set(item.id, name);
    const props: string[] = [];
    if (item.type === 'icon') props.push(`icon: ${item.name}`);
    if (item.type === 'shape' && item.shape !== 'rectangle') props.push(`shape: ${item.shape === 'ellipse' ? 'oval' : 'diamond'}`);
    if (item.color && !item.color.startsWith('#')) props.push(`color: ${item.color}`);
    lines.push(props.length ? `${quoteName(name)} [${props.join(', ')}]` : quoteName(name));
  }
  const edges = picked.filter((i): i is LineItem => i.type === 'line' && !!i.start.item && !!i.end.item && names.has(i.start.item) && names.has(i.end.item));
  if (edges.length) lines.push('');
  for (const edge of edges) {
    const connector = edge.dashed ? (edge.endArrow ? '-->' : '--') : edge.startArrow && edge.endArrow ? '<>' : edge.endArrow ? '>' : edge.startArrow ? '<' : '-';
    const label = edge.text ? `: ${edge.text}` : '';
    lines.push(`${quoteName(names.get(edge.start.item!)!)} ${connector} ${quoteName(names.get(edge.end.item!)!)}${label}`);
  }
  return lines.join('\n') + '\n';
}

// ---- comments ----

export function commentPosition(doc: CanvasDocument, thread: CommentThread): Point {
  const item = thread.item ? getItem(doc, thread.item) : undefined;
  if (!item) return { x: thread.x, y: thread.y };
  const p = { x: item.x + thread.x, y: item.y + thread.y };
  return item.rotation ? rotatePoint(p, centerOf(item), item.rotation) : p;
}

/** Offset of a canvas point from an item's top-left in the item's own (unrotated) frame, for pinning comments. */
export function offsetInItem(item: CanvasItem, p: Point): Point {
  const q = item.rotation ? rotatePoint(p, centerOf(item), -item.rotation) : p;
  return { x: q.x - item.x, y: q.y - item.y };
}

export function addComment(doc: CanvasDocument, thread: CommentThread): CanvasDocument {
  return { ...doc, comments: [...(doc.comments ?? []), thread] };
}

export function updateComment(doc: CanvasDocument, id: string, patch: Partial<Omit<CommentThread, 'id'>>): CanvasDocument {
  return { ...doc, comments: (doc.comments ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function replyToComment(doc: CanvasDocument, id: string, message: CommentMessage): CanvasDocument {
  return { ...doc, comments: (doc.comments ?? []).map((c) => (c.id === id ? { ...c, messages: [...c.messages, message] } : c)) };
}

export function removeComment(doc: CanvasDocument, id: string): CanvasDocument {
  return { ...doc, comments: (doc.comments ?? []).filter((c) => c.id !== id) };
}

// ---- rotation ----

/** Lines follow their ends and figures hold interactive diagrams, so neither rotates. */
export const canRotate = (item: CanvasItem) => item.type !== 'line' && item.type !== 'figure';

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

/**
 * Turns items by `degrees` about `pivot` (default: the centre of their bounds).
 * Each rotatable item turns and its centre orbits the pivot; figures only orbit;
 * free line ends orbit, attached ends follow their items.
 */
export function rotateItems(doc: CanvasDocument, ids: Iterable<string>, degrees: number, pivot?: Point): CanvasDocument {
  const set = new Set(ids);
  const picked = doc.items.filter((i) => set.has(i.id) && !i.locked);
  if (!picked.length || !degrees) return doc;
  const c = pivot ?? centerOf(boundsOf(picked)!);
  const items = doc.items.map((item) => {
    if (!set.has(item.id) || item.locked) return item;
    if (item.type === 'line') {
      const turn = (e: Endpoint): Endpoint => (e.item ? e : { ...e, ...rotatePoint(e, c, degrees) });
      return withLineBox({ ...item, start: turn(item.start), end: turn(item.end) });
    }
    const center = rotatePoint(centerOf(item), c, degrees);
    const moved = { ...item, x: center.x - item.w / 2, y: center.y - item.h / 2 } as CanvasItem;
    if (canRotate(item)) moved.rotation = normalizeAngle((item.rotation ?? 0) + degrees) || undefined;
    return moved;
  });
  return resolveLines({ ...doc, items });
}

/**
 * Resize for a rotated item: the handle drag is measured in the item's own
 * frame and the opposite side stays put on screen.
 */
export function resizeRotatedBox(box: Box, degrees: number, handle: Handle, dx: number, dy: number, keepRatio = false, min = 8): Box {
  const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -degrees);
  const next = resizeBox(box, handle, local.x, local.y, keepRatio, min);
  // The centre moved by (next centre − old centre) in the item's frame; turn that shift onto the canvas.
  const shift = rotatePoint({ x: next.x + next.w / 2 - (box.x + box.w / 2), y: next.y + next.h / 2 - (box.y + box.h / 2) }, { x: 0, y: 0 }, degrees);
  const cx = box.x + box.w / 2 + shift.x;
  const cy = box.y + box.h / 2 + shift.y;
  return { x: cx - next.w / 2, y: cy - next.h / 2, w: next.w, h: next.h };
}
