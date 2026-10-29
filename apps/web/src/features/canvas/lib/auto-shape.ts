/**
 * Auto-shape: a pen stroke that looks like a circle, ellipse, rectangle or
 * straight line becomes that clean shape (lines become arrows attached to
 * the shapes near their ends). Applied to the edit that added the stroke,
 * so it's one undo step.
 */
import {
  lineBetween,
  newItemId,
  resolveLines,
  type CanvasDocument,
  type CanvasItem,
  type Endpoint,
  type PenItem,
} from "@octonote/octodraw";
import { detectShape, type Point } from "./shape-detector";

const BIND_DISTANCE = 50;

function worldPoints(pen: PenItem): Point[] {
  return pen.points.map(([u, v]) => ({ x: pen.x + u * pen.w, y: pen.y + v * pen.h }));
}

function nearestShape(items: CanvasItem[], p: Point): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const item of items) {
    if (item.type !== "shape") continue;
    const dx = Math.max(item.x - p.x, 0, p.x - (item.x + item.w));
    const dy = Math.max(item.y - p.y, 0, p.y - (item.y + item.h));
    const d = Math.hypot(dx, dy);
    if (d <= BIND_DISTANCE && (!best || d < best.d)) best = { id: item.id, d };
  }
  return best?.id;
}

function convert(pen: PenItem, items: CanvasItem[]): CanvasItem | null {
  const points = worldPoints(pen);
  if (points.length < 8) return null;
  const s = detectShape(points);
  if (!s) return null;
  const base = { id: newItemId(), color: pen.color };
  switch (s.kind) {
    case "circle":
      return { ...base, type: "shape", shape: "ellipse", x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
    case "ellipse":
      return { ...base, type: "shape", shape: "ellipse", x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
    case "rectangle":
      return { ...base, type: "shape", shape: "rectangle", x: s.x, y: s.y, w: s.w, h: s.h };
    case "line": {
      const end = (x: number, y: number): Endpoint => {
        const item = nearestShape(items, { x, y });
        return item ? { x, y, item } : { x, y };
      };
      return { ...lineBetween(end(s.x1, s.y1), end(s.x2, s.y2), { color: pen.color }), id: base.id };
    }
  }
}

/** Replaces pen strokes added between `prev` and `next` with detected shapes. */
export function autoShape(prev: CanvasDocument, next: CanvasDocument): CanvasDocument {
  const before = new Set(prev.items.map((i) => i.id));
  let changed = false;
  const items = next.items.map((item) => {
    if (item.type !== "pen" || before.has(item.id)) return item;
    const shape = convert(item, next.items);
    if (!shape) return item;
    changed = true;
    return shape;
  });
  return changed ? resolveLines({ ...next, items }) : next;
}
