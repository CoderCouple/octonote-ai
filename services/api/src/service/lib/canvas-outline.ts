/**
 * A canvas (octodraw `CanvasDocument`) → a small vector outline the inline
 * card (MCP Apps) can draw: boxes, sticky notes, text, frames and figures
 * with their labels, and lines with their labels and arrowheads. Canvases
 * made by agents have no PNG snapshot until someone opens them in the web
 * app; this lets the card show the real diagram anyway.
 *
 * Line ends attached to an item are recomputed from that item (like
 * octodraw's `lineEnds`) and clipped to its outline. Rotation, pen strokes,
 * icons and images are left out.
 */

export interface OutlineShape {
  kind: "geo" | "note" | "text" | "frame";
  geo: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** A card colour name (black, blue, light-blue, …) or a hex value. */
  color: string;
  fill: string;
  dash: string;
  size: string;
  url?: string;
}

export interface OutlineArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bend: number;
  label: string;
  color: string;
  dash: string;
  start: string;
  end: string;
}

export interface CanvasOutline {
  shapes: OutlineShape[];
  arrows: OutlineArrow[];
}

interface Item {
  id: string;
  type: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
  shape?: string;
  text?: string;
  title?: string;
  device?: string;
  fontSize?: number;
  link?: string;
  start?: { x?: number; y?: number; item?: string };
  end?: { x?: number; y?: number; item?: string };
  startArrow?: boolean;
  endArrow?: boolean;
  dashed?: boolean;
}

const MAX_SHAPES = 600;
/** Gap between an attached line end and its item, as in octodraw. */
const END_GAP = 4;

/** Octodraw palette names → the card's colour names; hex values pass through. */
const COLOR_NAMES: Record<string, string> = {
  black: "black",
  gray: "grey",
  grey: "grey",
  blue: "blue",
  indigo: "violet",
  lightblue: "light-blue",
  cyan: "light-blue",
  teal: "green",
  green: "green",
  lime: "light-green",
  yellow: "yellow",
  orange: "orange",
  brown: "orange",
  red: "red",
  pink: "light-red",
  purple: "violet",
  violet: "violet",
};

function cardColor(color: unknown): string {
  if (typeof color !== "string" || !color) return "black";
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  return COLOR_NAMES[color.toLowerCase()] ?? "black";
}

/** Card font size key (s/m/l/xl) for an octodraw font size in px. */
function sizeKey(fontSize: unknown): string {
  const px = Number(fontSize) || 16;
  return px <= 16 ? "s" : px <= 20 ? "m" : px <= 26 ? "l" : "xl";
}

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Where a line from the shape's centre towards `toward` leaves its outline (plus a small gap). */
function outlinePoint(s: OutlineShape, toward: { x: number; y: number }) {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = Math.max(s.w / 2, 1) + END_GAP;
  const hh = Math.max(s.h / 2, 1) + END_GAP;
  let t: number;
  if (s.geo === "ellipse") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (s.geo === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  t = Math.min(t, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

function toShape(it: Item): OutlineShape | null {
  const box = { x: num(it.x), y: num(it.y), w: Math.max(num(it.w, 100), 1), h: Math.max(num(it.h, 60), 1) };
  const url = typeof it.link === "string" && it.link ? { url: it.link } : {};
  switch (it.type) {
    case "shape":
      return { ...box, ...url, kind: "geo", geo: it.shape === "ellipse" || it.shape === "diamond" ? it.shape : "rectangle", label: String(it.text ?? ""), color: cardColor(it.color), fill: "semi", dash: "solid", size: "s" };
    case "sticky":
      // The card paints an uncoloured ("black") note yellow, like octodraw's default sticky.
      return { ...box, ...url, kind: "note", geo: "rectangle", label: String(it.text ?? ""), color: it.color && it.color !== "yellow" ? cardColor(it.color) : "black", fill: "solid", dash: "solid", size: "s" };
    case "text":
      return { ...box, ...url, kind: "text", geo: "none", label: String(it.text ?? ""), color: cardColor(it.color), fill: "none", dash: "solid", size: sizeKey(it.fontSize) };
    case "code":
      return { ...box, ...url, kind: "geo", geo: "rectangle", label: String(it.text ?? "").split("\n").slice(0, 6).join("\n"), color: "grey", fill: "semi", dash: "solid", size: "s" };
    case "frame":
      return { ...box, ...url, kind: "frame", geo: "rectangle", label: String(it.title ?? ""), color: "grey", fill: "none", dash: "solid", size: "s" };
    case "figure":
      return { ...box, ...url, kind: "geo", geo: "rectangle", label: "Diagram", color: "grey", fill: "none", dash: "dashed", size: "s" };
    default:
      return null;
  }
}

/** The outline of an octodraw canvas document, or null when there's nothing to draw. */
export function canvasOutline(document: unknown): CanvasOutline | null {
  const items = (document as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;

  const shapes: OutlineShape[] = [];
  const shapeById = new Map<string, OutlineShape>();
  for (const it of items as Item[]) {
    if (!it || typeof it !== "object" || shapes.length >= MAX_SHAPES) continue;
    const shape = toShape(it);
    if (!shape) continue;
    shapes.push(shape);
    if (typeof it.id === "string") shapeById.set(it.id, shape);
  }

  const arrows: OutlineArrow[] = [];
  for (const it of items as Item[]) {
    if (!it || it.type !== "line" || arrows.length >= MAX_SHAPES) continue;
    const target = (e: Item["start"]) => (e?.item ? shapeById.get(e.item) : undefined);
    const free = (e: Item["start"]) => ({ x: num(e?.x), y: num(e?.y) });
    const centre = (s: OutlineShape) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
    const s = target(it.start);
    const t = target(it.end);
    const aimS = s ? centre(s) : free(it.start);
    const aimT = t ? centre(t) : free(it.end);
    const from = s ? outlinePoint(s, aimT) : aimS;
    const to = t ? outlinePoint(t, aimS) : aimT;
    arrows.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      bend: 0,
      label: String(it.text ?? ""),
      color: cardColor(it.color),
      dash: it.dashed ? "dashed" : "solid",
      start: it.startArrow ? "arrow" : "none",
      end: it.endArrow ? "arrow" : "none",
    });
  }

  if (!shapes.length && !arrows.length) return null;
  // Frames first so they sit behind their contents.
  shapes.sort((a, b) => Number(b.kind === "frame") - Number(a.kind === "frame"));
  return { shapes, arrows };
}
