/**
 * A canvas (octodraw `CanvasDocument`) → a small vector outline the inline
 * card (MCP Apps) can draw: boxes, sticky notes, text, frames and figures
 * with their labels, and lines with their labels and arrowheads. Canvases
 * made by agents have no PNG snapshot until someone opens them in the web
 * app; this lets the card show the real diagram anyway.
 *
 * Line ends attached to an item are recomputed with octodraw's own rule
 * (`octodrawLineEnds`: aimed at the end's anchor or the item's centre — on a
 * bent line at the control point — and clipped to the outline); bends (same
 * convention as the card), dashed and dotted outlines, arrowheads and fills
 * carry over (elbow lines are drawn straight, stroke widths and opacity at the
 * card's defaults). Rotation, pen strokes, icons and images are left out.
 */
import { octodrawLineEnds, type OctodrawItem } from "@octonote/content/server";

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
  start?: { x?: number; y?: number; item?: string; anchor?: { x?: number; y?: number } };
  end?: { x?: number; y?: number; item?: string; anchor?: { x?: number; y?: number } };
  startArrow?: boolean;
  endArrow?: boolean;
  startHead?: string;
  endHead?: string;
  dashed?: boolean;
  strokeStyle?: string;
  route?: string;
  bend?: number;
  fill?: string;
  fillColor?: string;
  strokeColor?: string;
  rotation?: number;
}

const MAX_SHAPES = 600;

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

/** Octodraw outline style → the card's dash key (legacy `dashed` = dashed). */
const dashKey = (it: Item) => (it.strokeStyle === "dashed" || it.strokeStyle === "dotted" ? it.strokeStyle : it.strokeStyle === "solid" ? "solid" : it.dashed ? "dashed" : "solid");

/** Octodraw arrowhead (new `startHead`/`endHead`, else the legacy boolean) → the card's: "none" or the head name. */
const headKey = (head: unknown, legacy: unknown) => (typeof head === "string" ? head : legacy ? "arrow" : "none");

/** Octodraw fill → the card's fill key (undefined = octodraw's default tint). */
const fillKey = (fill: unknown) => (fill === "none" ? "none" : fill === "solid" ? "solid" : "semi");

function toShape(it: Item): OutlineShape | null {
  const box = { x: num(it.x), y: num(it.y), w: Math.max(num(it.w, 100), 1), h: Math.max(num(it.h, 60), 1) };
  const url = typeof it.link === "string" && it.link ? { url: it.link } : {};
  switch (it.type) {
    case "shape":
      return { ...box, ...url, kind: "geo", geo: it.shape === "ellipse" || it.shape === "diamond" ? it.shape : "rectangle", label: String(it.text ?? ""), color: cardColor(it.color ?? it.fillColor ?? it.strokeColor), fill: fillKey(it.fill), dash: dashKey(it), size: "s" };
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
  /** Items lines can attach to, with sane boxes, in octodraw's shape (for its line maths). */
  const targets = new Map<string, OctodrawItem>();
  for (const it of items as Item[]) {
    if (!it || typeof it !== "object" || shapes.length >= MAX_SHAPES) continue;
    const shape = toShape(it);
    if (!shape) continue;
    shapes.push(shape);
    if (typeof it.id === "string") {
      // The card draws boxes unrotated, so its line ends ignore rotation too.
      targets.set(it.id, { ...(it as unknown as OctodrawItem), x: shape.x, y: shape.y, w: shape.w, h: shape.h, rotation: undefined });
    }
  }

  const arrows: OutlineArrow[] = [];
  for (const it of items as Item[]) {
    if (!it || it.type !== "line" || arrows.length >= MAX_SHAPES) continue;
    const end = (e: Item["start"]) => {
      const a = e?.anchor;
      const anchor = a && Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y)) ? { x: Math.min(1, Math.max(0, Number(a.x))), y: Math.min(1, Math.max(0, Number(a.y))) } : undefined;
      return { x: num(e?.x), y: num(e?.y), ...(e?.item && targets.has(e.item) ? { item: e.item } : {}), ...(anchor ? { anchor } : {}) };
    };
    // Elbow and explicitly straight lines are drawn straight on the card.
    const bend = it.route === "elbow" || it.route === "straight" ? 0 : num(it.bend);
    const line = { id: String(it.id), type: "line", x: 0, y: 0, w: 0, h: 0, start: end(it.start), end: end(it.end), ...(bend ? { bend } : {}) };
    const { start: from, end: to } = octodrawLineEnds(line as never, targets);
    arrows.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      // Same convention as octodraw (the card draws a quadratic through mid + bend·n).
      bend,
      label: String(it.text ?? ""),
      color: cardColor(it.color),
      dash: dashKey(it),
      start: headKey(it.startHead, it.startArrow),
      end: headKey(it.endHead, it.endArrow),
    });
  }

  if (!shapes.length && !arrows.length) return null;
  // Frames first so they sit behind their contents.
  shapes.sort((a, b) => Number(b.kind === "frame") - Number(a.kind === "frame"));
  return { shapes, arrows };
}
