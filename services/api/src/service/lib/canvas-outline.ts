/**
 * A canvas (tldraw store snapshot) → a small vector outline the inline card
 * (MCP Apps) can draw: boxes, sticky notes, text and frames with their
 * labels, and arrows with their labels. Canvases made by agents have no PNG
 * snapshot until someone opens them in the web app; this lets the card show
 * the real diagram anyway.
 *
 * Arrow ends that are bound to a shape are recomputed from that shape (the
 * stored points go stale when people move boxes) and clipped to its outline.
 * Rotation, curves of hand-drawn strokes and images are left out.
 */

export interface OutlineShape {
  kind: "geo" | "note" | "text" | "frame";
  geo: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
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

type Rec = { id: string; typeName?: string; type?: string; x?: number; y?: number; parentId?: string; props?: Record<string, any>; fromId?: string; toId?: string };

const MAX_SHAPES = 600;

/** Plain text of a tldraw richText (TipTap JSON) value; paragraphs become lines. */
export function richTextToPlain(rt: unknown): string {
  if (!rt || typeof rt !== "object") return typeof rt === "string" ? rt : "";
  const lines: string[] = [];
  const walk = (node: any, line: string[]): void => {
    if (node?.type === "text" && typeof node.text === "string") line.push(node.text);
    if (Array.isArray(node?.content)) {
      for (const c of node.content) {
        if (c?.type === "paragraph" || c?.type === "heading" || c?.type === "listItem") {
          const own: string[] = [];
          walk(c, own);
          lines.push(own.join(""));
        } else walk(c, line);
      }
    }
  };
  const top: string[] = [];
  walk(rt, top);
  if (top.length) lines.unshift(top.join(""));
  return lines.join("\n").trim();
}

/** Where a line from `from` towards the shape's anchor `to` meets the shape's outline. */
function clipToShape(s: OutlineShape, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  if (!dx && !dy) return to;
  const hw = Math.max(s.w / 2, 1);
  const hh = Math.max(s.h / 2, 1);
  // Only clip from the centre; an off-centre anchor is kept as-is.
  if (Math.abs(to.x - cx) > 1 || Math.abs(to.y - cy) > 1) return to;
  let t: number;
  if (s.geo === "ellipse" || s.geo === "oval" || s.geo === "cloud") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (s.geo === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  t = Math.min(t, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function canvasOutline(document: unknown): CanvasOutline | null {
  const store = (document as { store?: Record<string, Rec> } | null)?.store;
  if (!store || typeof store !== "object") return null;
  const recs = Object.values(store);
  const byId = new Map(recs.map((r) => [r.id, r]));

  // Absolute position: shapes inside frames/groups are relative to them.
  const abs = (r: Rec, depth = 0): { x: number; y: number } => {
    const own = { x: Number(r.x) || 0, y: Number(r.y) || 0 };
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    if (!parent || parent.typeName !== "shape" || depth > 20) return own;
    const p = abs(parent, depth + 1);
    return { x: own.x + p.x, y: own.y + p.y };
  };

  const shapes: OutlineShape[] = [];
  const shapeById = new Map<string, OutlineShape>();
  for (const r of recs) {
    if (r.typeName !== "shape" || shapes.length >= MAX_SHAPES) continue;
    const p = r.props ?? {};
    const pos = abs(r);
    let shape: OutlineShape | null = null;
    const base = { x: pos.x, y: pos.y, color: String(p.color ?? "black"), size: String(p.size ?? "m"), dash: String(p.dash ?? "draw") };
    if (r.type === "geo") {
      shape = { ...base, kind: "geo", geo: String(p.geo ?? "rectangle"), w: Number(p.w) || 100, h: (Number(p.h) || 60) + (Number(p.growY) || 0), label: richTextToPlain(p.richText ?? p.text), fill: String(p.fill ?? "none"), ...(p.url ? { url: String(p.url) } : {}) };
    } else if (r.type === "note") {
      shape = { ...base, kind: "note", geo: "rectangle", w: 200, h: 200 + (Number(p.growY) || 0), label: richTextToPlain(p.richText ?? p.text), fill: "solid", dash: "solid" };
    } else if (r.type === "text") {
      const label = richTextToPlain(p.richText ?? p.text);
      shape = { ...base, kind: "text", geo: "none", w: Number(p.w) || Math.max(40, label.length * 9), h: 30 * Math.max(1, label.split("\n").length), label, fill: "none", dash: "solid" };
    } else if (r.type === "frame") {
      shape = { ...base, kind: "frame", geo: "rectangle", w: Number(p.w) || 300, h: Number(p.h) || 200, label: String(p.name ?? ""), fill: "none", dash: "solid", color: "grey" };
    }
    if (shape) {
      shapes.push(shape);
      shapeById.set(r.id, shape);
    }
  }

  const bindings = new Map<string, Rec>();
  for (const r of recs) {
    if (r.typeName === "binding" && r.type === "arrow" && r.fromId && r.props?.terminal) bindings.set(`${r.fromId}:${r.props.terminal}`, r);
  }

  const arrows: OutlineArrow[] = [];
  for (const r of recs) {
    if (r.typeName !== "shape" || r.type !== "arrow" || arrows.length >= MAX_SHAPES) continue;
    const p = r.props ?? {};
    const pos = abs(r);
    const point = (key: "start" | "end") => ({ x: pos.x + (Number(p[key]?.x) || 0), y: pos.y + (Number(p[key]?.y) || 0) });
    const anchor = (key: "start" | "end") => {
      const b = bindings.get(`${r.id}:${key}`);
      const target = b?.toId ? shapeById.get(b.toId) : undefined;
      if (!b || !target) return { at: point(key), target: undefined };
      const a = b.props?.normalizedAnchor ?? { x: 0.5, y: 0.5 };
      return { at: { x: target.x + target.w * (Number(a.x) || 0), y: target.y + target.h * (Number(a.y) || 0) }, target, precise: Boolean(b.props?.isPrecise) };
    };
    const s = anchor("start");
    const e = anchor("end");
    const from = s.target ? clipToShape(s.target, e.at, s.at) : s.at;
    const to = e.target ? clipToShape(e.target, s.at, e.at) : e.at;
    arrows.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      bend: Number(p.bend) || 0,
      label: richTextToPlain(p.richText ?? p.text),
      color: String(p.color ?? "black"),
      dash: String(p.dash ?? "solid"),
      start: String(p.arrowheadStart ?? "none"),
      end: String(p.arrowheadEnd ?? "arrow"),
    });
  }

  if (!shapes.length && !arrows.length) return null;
  // Frames first so they sit behind their contents.
  shapes.sort((a, b) => Number(b.kind === "frame") - Number(a.kind === "frame"));
  return { shapes, arrows };
}
