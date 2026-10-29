/**
 * A stored tldraw canvas (what `canvases.document` held before octodraw) →
 * an octodraw `CanvasDocument`. Pure, deterministic and defensive: it never
 * throws on malformed input, it just leaves out what it can't read.
 *
 * Accepted inputs: a store snapshot `{ store, schema }`, an editor snapshot
 * `{ document: { store, schema }, session }` (what the web app saved) and a
 * `.tldr` file `{ records: [...], schema }`.
 *
 * Mapping (lossy parts marked ~):
 *   geo     → shape (rectangle / ellipse / diamond; other geos → rectangle~),
 *             label as text, `url` as `link`. ~fill, dash, size, font, label
 *             alignment are dropped (octodraw centres shape text).
 *   note    → sticky (tldraw's default "black" note is yellow, so no color).
 *   text    → text; size s/m/l/xl → octodraw's 14/20/32/48 presets × scale.
 *   frame   → a plain rectangle + its name as a small text above it (tldraw
 *             frames are untyped containers; octodraw frames are device
 *             outlines). ~No clipping of children.
 *   figure  → (Octonote's titled container) a rectangle + bold title inside
 *             its title bar. ~The figure's identity (meta.figureId, used by
 *             notes that embed it) is not kept.
 *   arrow   → line; bound ends attach (`item`) to the converted shape,
 *             arrowheads become start/endArrow (~every head style is drawn
 *             as octodraw's arrow), dashed/dotted → dashed, label → text.
 *             ~Bends, elbow routing and precise anchors become straight
 *             centre-aimed lines.
 *   line    → line for two points; 3+ points → pen (~a smoothed stroke).
 *   draw / highlight → pen, points normalized to the box. ~Stroke width,
 *             pressure, closed/filled strokes.
 *   image   → image (src from its asset record). Video, bookmark, embed and
 *             unknown/custom shapes are skipped.
 *   group   → no item; its children keep their place.
 * Positions are absolute (parent offsets and rotations applied), rotation
 * becomes clockwise degrees, and items come out in tldraw's paint order
 * (parents before children, siblings by index), so containers sit behind
 * what's inside them and later items draw on top. Extra pages are placed to
 * the right of the first, each under a title.
 */
import {
  emptyOctodrawDocument,
  settleLines,
  type CanvasDocument,
  type CanvasItem,
  type Endpoint,
  type ImageItem,
  type LineItem,
  type PenItem,
  type ShapeItem,
  type ShapeKind,
  type StickyItem,
  type TextItem,
} from "./octodraw-types";

type Obj = Record<string, unknown>;
interface Rec extends Obj {
  id: string;
  typeName?: unknown;
  type?: unknown;
  parentId?: unknown;
  index?: unknown;
  x?: unknown;
  y?: unknown;
  rotation?: unknown;
  props?: Obj;
}
interface Pt {
  x: number;
  y: number;
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const round = (v: number, places = 2) => {
  const f = 10 ** places;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

// ---------------------------------------------------------------- input

interface TldrawInput {
  store: Record<string, Rec>;
  sequences: Record<string, number>;
}

function readInput(value: unknown): TldrawInput | null {
  if (!isObj(value)) return null;
  let store: unknown;
  let schema: unknown;
  if (isObj(value.store)) {
    store = value.store;
    schema = value.schema;
  } else if (isObj(value.document) && isObj(value.document.store)) {
    store = value.document.store;
    schema = value.document.schema ?? value.schema;
  } else if (Array.isArray(value.records)) {
    const map: Obj = {};
    for (const r of value.records) if (isObj(r) && typeof r.id === "string") map[r.id] = r;
    store = map;
    schema = value.schema;
  } else return null;
  const records: Record<string, Rec> = {};
  for (const [key, r] of Object.entries(store as Obj)) {
    if (!isObj(r)) continue;
    const id = typeof r.id === "string" ? r.id : key;
    records[id] = { ...r, id } as Rec;
  }
  const sequences: Record<string, number> = {};
  const seq = isObj(schema) && isObj(schema.sequences) ? schema.sequences : {};
  for (const [k, v] of Object.entries(seq)) if (typeof v === "number") sequences[k] = v;
  return { store: records, sequences };
}

/** True for a stored tldraw canvas (store/editor snapshot or .tldr file). */
export function isTldrawDocument(value: unknown): boolean {
  const input = readInput(value);
  if (!input) return false;
  const recs = Object.values(input.store);
  if (recs.length === 0) return Object.keys(input.sequences).some((k) => k.startsWith("com.tldraw"));
  return recs.some((r) => typeof r.typeName === "string");
}

// ---------------------------------------------------------------- text

/** Plain text of a tldraw richText (TipTap JSON) value; each block (paragraph, heading, …) is a line. */
export function richTextToPlain(rt: unknown): string {
  if (typeof rt === "string") return rt;
  if (!isObj(rt)) return "";
  const LINE = new Set(["paragraph", "heading", "codeBlock"]);
  const lines: string[] = [];
  const inline = (node: unknown, out: string[], depth: number): void => {
    if (!isObj(node) || depth > 50) return;
    if (node.type === "text" && typeof node.text === "string") out.push(node.text);
    else if (node.type === "hardBreak") out.push("\n");
    if (Array.isArray(node.content)) for (const c of node.content) inline(c, out, depth + 1);
  };
  const blocks = (node: unknown, depth: number): void => {
    if (!isObj(node) || depth > 50) return;
    if (typeof node.type === "string" && LINE.has(node.type)) {
      const out: string[] = [];
      inline(node, out, depth + 1);
      lines.push(out.join(""));
    } else if (node.type === "text") {
      lines.push(typeof node.text === "string" ? node.text : "");
    } else if (Array.isArray(node.content)) for (const c of node.content) blocks(c, depth + 1);
  };
  blocks(rt, 0);
  return lines.join("\n").trim();
}

const labelOf = (p: Obj) => richTextToPlain(p.richText ?? p.text);

// ---------------------------------------------------------------- styles

/** tldraw color style → octodraw palette name (undefined = theme default ink). */
const COLORS: Record<string, string | undefined> = {
  black: undefined,
  grey: "gray",
  "light-violet": "violet",
  violet: "purple",
  blue: "blue",
  "light-blue": "lightblue",
  yellow: "yellow",
  orange: "orange",
  green: "green",
  "light-green": "lime",
  "light-red": "pink",
  red: "red",
  white: "#ffffff",
};
const colorOf = (v: unknown): string | undefined => COLORS[str(v)];

/** tldraw text sizes → octodraw's text presets (S/M/L/XL). */
const TEXT_SIZES: Record<string, number> = { s: 14, m: 20, l: 32, xl: 48 };
const TEXT_LINE_HEIGHT = 1.3;

function geoShape(geo: string): ShapeKind {
  if (geo === "ellipse" || geo === "oval" || geo === "cloud") return "ellipse";
  if (geo === "diamond") return "diamond";
  return "rectangle";
}

function safeLink(raw: unknown): string | undefined {
  const s = str(raw).trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- transforms

/** Page-space placement: point = origin + R(rotation) · local. */
interface Xf {
  ox: number;
  oy: number;
  /** Radians, clockwise on screen (y down) — tldraw's convention. */
  rot: number;
}
const apply = (t: Xf, p: Pt): Pt => {
  const cos = Math.cos(t.rot);
  const sin = Math.sin(t.rot);
  return { x: t.ox + p.x * cos - p.y * sin, y: t.oy + p.x * sin + p.y * cos };
};

function degrees(rad: number): number | undefined {
  let d = ((rad * 180) / Math.PI) % 360;
  if (d < 0) d += 360;
  d = round(d, 3);
  return d === 0 || d === 360 ? undefined : d;
}

/** An axis-aligned w×h box placed by a transform: octodraw stores the centre-based box + rotation. */
function placeBox(t: Xf, w: number, h: number) {
  const c = apply(t, { x: w / 2, y: h / 2 });
  const rotation = degrees(t.rot);
  return {
    x: round(c.x - w / 2),
    y: round(c.y - h / 2),
    w: round(w),
    h: round(h),
    ...(rotation !== undefined ? { rotation } : {}),
  };
}

// ---------------------------------------------------------------- draw paths

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = new Map([...B64].map((c, i) => [c, i]));

function base64Bytes(s: string): Uint8Array | null {
  const clean = s.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let j = 0;
  for (const ch of clean) {
    const v = B64_LOOKUP.get(ch);
    if (v === undefined) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (acc >> bits) & 255;
    }
  }
  return bytes.subarray(0, j);
}

function float16(view: DataView, offset: number): number {
  const bits = view.getUint16(offset, true);
  const sign = bits >> 15 ? -1 : 1;
  const exp = (bits >> 10) & 0x1f;
  const frac = bits & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

const MAX_POINTS = 4000;

/**
 * tldraw draw segments → local points. Old documents keep `points` arrays;
 * newer ones a base64 `path`: first point as float32s, then float16 deltas
 * (`dim` 2 = x,y; else x,y,z). Draw schema v3 / highlight v2 used an older
 * absolute float16 encoding.
 */
function segmentPoints(segment: unknown, legacyB64: boolean): Pt[] {
  if (!isObj(segment)) return [];
  if (Array.isArray(segment.points)) {
    return segment.points.filter(isObj).map((p) => ({ x: num(p.x), y: num(p.y) }));
  }
  if (typeof segment.path !== "string" || !segment.path) return [];
  const bytes = base64Bytes(segment.path);
  if (!bytes) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Pt[] = [];
  try {
    if (legacyB64) {
      for (let o = 0; o + 6 <= bytes.length && out.length < MAX_POINTS; o += 6) out.push({ x: float16(view, o), y: float16(view, o + 2) });
    } else {
      const two = segment.dim === 2;
      const first = two ? 8 : 12;
      const step = two ? 4 : 6;
      if (bytes.length < first) return [];
      let x = view.getFloat32(0, true);
      let y = view.getFloat32(4, true);
      out.push({ x, y });
      for (let o = first; o + 4 <= bytes.length && out.length < MAX_POINTS; o += step) {
        x += float16(view, o);
        y += float16(view, o + 2);
        out.push({ x, y });
      }
    }
  } catch {
    return [];
  }
  return out.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Page-space points → a pen item with points normalized to its box. */
function penFrom(id: string, pts: Pt[], color: string | undefined): PenItem | null {
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  const pen: PenItem = {
    id,
    type: "pen",
    x: round(x),
    y: round(y),
    w: round(Math.max(w, 1)),
    h: round(Math.max(h, 1)),
    points: pts.map((p) => [round(w ? (p.x - x) / w : 0.5, 4), round(h ? (p.y - y) / h : 0.5, 4)]),
  };
  if (color) pen.color = color;
  return pen;
}

// ---------------------------------------------------------------- converter

const FRAME_TITLE_SIZE = 14;
const FIGURE_TITLE_HEIGHT = 32;
const PAGE_GAP = 400;
const MAX_ITEMS = 20000;

const textWidth = (text: string, size: number) =>
  Math.ceil(Math.max(...text.split("\n").map((l) => l.length), 1) * size * 0.56) + 6;
const textHeight = (text: string, size: number) => Math.ceil(Math.max(1, text.split("\n").length) * size * TEXT_LINE_HEIGHT) + 2;

/** Compares tldraw fractional indices the way tldraw does (plain string order). */
const byIndex = (a: Rec, b: Rec) => {
  const ia = str(a.index);
  const ib = str(b.index);
  return ia < ib ? -1 : ia > ib ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** The octodraw id for a tldraw record id ("shape:abc" → "abc"). */
const itemId = (recordId: string) => recordId.replace(/^shape:/, "");

export function tldrawToOctodraw(snapshot: unknown): CanvasDocument {
  const input = readInput(snapshot);
  if (!input) return emptyOctodrawDocument();
  const { store, sequences } = input;
  const recs = Object.values(store);

  const children = new Map<string, Rec[]>();
  for (const r of recs) {
    if (r.typeName !== "shape" || typeof r.parentId !== "string") continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r);
    children.set(r.parentId, list);
  }
  for (const list of children.values()) list.sort(byIndex);

  const bindings = new Map<string, Rec>();
  for (const r of recs) {
    if (r.typeName !== "binding" || r.type !== "arrow" || typeof r.fromId !== "string" || !isObj(r.props)) continue;
    const terminal = r.props.terminal;
    if (terminal === "start" || terminal === "end") bindings.set(`${r.fromId}:${terminal}`, r);
  }

  const drawLegacy = (sequences["com.tldraw.shape.draw"] ?? 99) <= 3;
  const highlightLegacy = (sequences["com.tldraw.shape.highlight"] ?? 99) <= 2;

  const items: CanvasItem[] = [];
  /** tldraw shape id → the octodraw item arrows attach to, and its page placement. */
  const targets = new Map<string, { item: string; xf: Xf; w: number; h: number }>();
  /** Arrows wait until every shape is placed (they may bind to later shapes). */
  const arrows: { rec: Rec; xf: Xf; at: number; id: string }[] = [];
  const used = new Set<string>();
  const uniqueId = (base: string) => {
    let id = base || "item";
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  const visit = (rec: Rec, parent: Xf, depth: number) => {
    if (depth > 64 || items.length >= MAX_ITEMS) return;
    const p = isObj(rec.props) ? rec.props : {};
    const local = apply(parent, { x: num(rec.x), y: num(rec.y) });
    const xf: Xf = { ox: local.x, oy: local.y, rot: parent.rot + num(rec.rotation) };
    const id = uniqueId(itemId(rec.id));
    const color = colorOf(p.color);
    const scale = num(p.scale, 1) || 1;
    const target = (w: number, h: number) => targets.set(rec.id, { item: id, xf, w, h });

    switch (rec.type) {
      case "geo": {
        const w = Math.max(1, num(p.w, 100));
        const h = Math.max(1, num(p.h, 100) + num(p.growY));
        const shape: ShapeItem = { id, type: "shape", shape: geoShape(str(p.geo)), ...placeBox(xf, w, h) };
        const text = labelOf(p);
        if (text) shape.text = text;
        if (color) shape.color = color;
        const link = safeLink(p.url);
        if (link) shape.link = link;
        items.push(shape);
        target(w, h);
        break;
      }
      case "note": {
        const w = 200 * scale;
        const h = (200 + num(p.growY)) * scale;
        const sticky: StickyItem = { id, type: "sticky", ...placeBox(xf, w, h), text: labelOf(p) };
        if (color) sticky.color = color;
        const link = safeLink(p.url);
        if (link) sticky.link = link;
        items.push(sticky);
        target(w, h);
        break;
      }
      case "text": {
        const text = labelOf(p);
        const fontSize = Math.max(6, Math.round((TEXT_SIZES[str(p.size)] ?? 20) * scale));
        const w = p.autoSize === false && num(p.w) > 0 ? num(p.w) * scale : textWidth(text, fontSize);
        const h = textHeight(text, fontSize);
        const item: TextItem = { id, type: "text", ...placeBox(xf, w, h), text, fontSize };
        const align = str(p.textAlign);
        if (align === "middle") item.align = "center";
        else if (align === "end") item.align = "right";
        if (color) item.color = color;
        items.push(item);
        target(w, h);
        break;
      }
      case "frame":
      case "figure": {
        const w = Math.max(1, num(p.w, 320));
        const h = Math.max(1, num(p.h, 200));
        items.push({ id, type: "shape", shape: "rectangle", ...placeBox(xf, w, h), ...(color && rec.type === "frame" ? { color } : {}) });
        target(w, h);
        const title = rec.type === "frame" ? str(p.name) : str(p.label);
        if (title) {
          const bold = rec.type === "figure";
          const th = textHeight(title, FRAME_TITLE_SIZE);
          // Frames show their name just above; figures inside their title bar.
          const at = rec.type === "frame" ? { x: 0, y: -th - 4 } : { x: 12, y: (FIGURE_TITLE_HEIGHT - th) / 2 };
          const tw = Math.min(textWidth(title, FRAME_TITLE_SIZE), Math.max(24, w - (bold ? 24 : 0)));
          const origin = apply(xf, at);
          const titleItem: TextItem = {
            id: uniqueId(`${id}-title`),
            type: "text",
            ...placeBox({ ...xf, ox: origin.x, oy: origin.y }, tw, th),
            text: title,
            fontSize: FRAME_TITLE_SIZE,
            ...(bold ? { bold: true } : { color: "gray" }),
          };
          items.push(titleItem);
        }
        break;
      }
      case "image": {
        const assetId = str(p.assetId);
        const asset = assetId ? store[assetId] : undefined;
        const aprops = asset && isObj(asset.props) ? asset.props : {};
        const src = str(aprops.src) || str(p.url);
        const w = Math.max(1, num(p.w, 100));
        const h = Math.max(1, num(p.h, 100));
        if (src && !/^\s*javascript:/i.test(src)) {
          const image: ImageItem = { id, type: "image", ...placeBox(xf, w, h), src };
          const alt = str(p.altText) || str(aprops.name);
          if (alt) image.alt = alt;
          items.push(image);
          target(w, h);
        } else used.delete(id);
        break;
      }
      case "draw":
      case "highlight": {
        const legacy = rec.type === "draw" ? drawLegacy : highlightLegacy;
        const sx = num(p.scaleX, 1) || 1;
        const sy = num(p.scaleY, 1) || 1;
        const pts: Pt[] = [];
        for (const seg of Array.isArray(p.segments) ? p.segments : []) {
          for (const q of segmentPoints(seg, legacy)) {
            if (pts.length >= MAX_POINTS) break;
            pts.push(apply(xf, { x: q.x * sx, y: q.y * sy }));
          }
        }
        const pen = penFrom(id, pts, color ?? (rec.type === "highlight" ? "yellow" : undefined));
        if (pen) items.push(pen);
        else used.delete(id);
        break;
      }
      case "line": {
        const raw = isObj(p.points) ? Object.values(p.points).filter(isObj) : Array.isArray(p.points) ? p.points.filter(isObj) : [];
        const sorted = [...raw].sort((a, b) => (str(a.index) < str(b.index) ? -1 : str(a.index) > str(b.index) ? 1 : 0));
        const pts = sorted.map((q) => apply(xf, { x: num(q.x), y: num(q.y) }));
        if (pts.length === 2) {
          const line: LineItem = { id, type: "line", x: 0, y: 0, w: 0, h: 0, start: rounded(pts[0]!), end: rounded(pts[1]!) };
          if (color) line.color = color;
          if (str(p.dash) === "dashed" || str(p.dash) === "dotted") line.dashed = true;
          items.push(line);
        } else {
          const pen = penFrom(id, pts, color);
          if (pen) items.push(pen);
          else used.delete(id);
        }
        break;
      }
      case "arrow":
        arrows.push({ rec, xf, at: items.length, id });
        // Keep its place in the paint order; filled in below.
        items.push(null as unknown as CanvasItem);
        break;
      case "group":
        used.delete(id);
        break;
      default:
        // Video, bookmark, embed and custom shapes: skipped (their children too).
        used.delete(id);
        return;
    }
    for (const child of children.get(rec.id) ?? []) visit(child, xf, depth + 1);
  };

  let pages = recs.filter((r) => r.typeName === "page").sort(byIndex);
  if (pages.length === 0) {
    // No page records (a partial store): treat every "page:" parent as a page.
    const ids = [...children.keys()].filter((k) => k.startsWith("page:")).sort();
    pages = ids.map((id) => ({ id, typeName: "page" }) as Rec);
  }
  let pageOffset: number | null = null;
  for (const page of pages) {
    const start = items.length;
    for (const child of children.get(page.id) ?? []) visit(child, { ox: 0, oy: 0, rot: 0 }, 0);
    if (pages.length > 1) pageOffset = placePage(items, start, pageOffset, str(page.name), uniqueId(`page-${itemId(page.id.replace(/^page:/, ""))}`), arrows, targets);
  }

  for (const { rec, xf, at, id } of arrows) items[at] = arrowLine(rec, xf, bindings, targets, id);

  return { version: 1, items: settleLines(items.filter(Boolean)).map(roundLine) };
}

const rounded = (p: Pt): Endpoint => ({ x: round(p.x), y: round(p.y) });

function roundLine(item: CanvasItem): CanvasItem {
  if (item.type !== "line") return item;
  return {
    ...item,
    x: round(item.x),
    y: round(item.y),
    w: round(item.w),
    h: round(item.h),
    start: { ...item.start, x: round(item.start.x), y: round(item.start.y) },
    end: { ...item.end, x: round(item.end.x), y: round(item.end.y) },
  };
}

function arrowLine(
  rec: Rec,
  xf: Xf,
  bindings: Map<string, Rec>,
  targets: Map<string, { item: string; xf: Xf; w: number; h: number }>,
  id: string,
): LineItem {
  const p = isObj(rec.props) ? rec.props : {};
  const end = (key: "start" | "end"): Endpoint => {
    const b = bindings.get(`${rec.id}:${key}`);
    const target = b && typeof b.toId === "string" ? targets.get(b.toId) : undefined;
    if (b && target) {
      const bp = isObj(b.props) ? b.props : {};
      const a = isObj(bp.normalizedAnchor) ? bp.normalizedAnchor : {};
      const at = apply(target.xf, { x: target.w * num(a.x, 0.5), y: target.h * num(a.y, 0.5) });
      return { ...rounded(at), item: target.item };
    }
    const local = isObj(p[key]) ? (p[key] as Obj) : {};
    return rounded(apply(xf, { x: num(local.x), y: num(local.y) }));
  };
  const line: LineItem = { id, type: "line", x: 0, y: 0, w: 0, h: 0, start: end("start"), end: end("end") };
  if (line.start.item && line.start.item === line.end.item) {
    // A loop onto one shape: octodraw can't draw it; keep it as a free line.
    delete line.end.item;
  }
  const head = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  if (head(p.arrowheadStart, "none") !== "none") line.startArrow = true;
  if (head(p.arrowheadEnd, "arrow") !== "none") line.endArrow = true;
  if (str(p.dash) === "dashed" || str(p.dash) === "dotted") line.dashed = true;
  const color = colorOf(p.color);
  if (color) line.color = color;
  const text = labelOf(p);
  if (text) line.text = text;
  return line;
}

/**
 * Multi-page documents: each page after the first moves right of everything
 * placed so far; every page gets its name as a heading above its content.
 * Returns the right edge used so far.
 */
function placePage(
  items: CanvasItem[],
  start: number,
  rightSoFar: number | null,
  name: string,
  titleId: string,
  arrows: { rec: Rec; xf: Xf; at: number; id: string }[],
  targets: Map<string, { item: string; xf: Xf; w: number; h: number }>,
): number | null {
  const placed = items.slice(start).filter(Boolean);
  const boxes = placed.filter((i) => i.type !== "line");
  const pageArrows = arrows.filter((a) => a.at >= start);
  if (boxes.length === 0 && pageArrows.length === 0) return rightSoFar;
  const left = boxes.length ? Math.min(...boxes.map((b) => b.x)) : pageArrows[0]!.xf.ox;
  const top = boxes.length ? Math.min(...boxes.map((b) => b.y)) : pageArrows[0]!.xf.oy;
  const dx = rightSoFar === null ? 0 : rightSoFar + PAGE_GAP - left;
  if (dx) {
    for (let i = start; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      if (it.type === "line") {
        items[i] = { ...it, x: it.x + dx, start: { ...it.start, x: it.start.x + dx }, end: { ...it.end, x: it.end.x + dx } };
      } else items[i] = { ...it, x: round(it.x + dx) };
    }
    for (const a of pageArrows) a.xf = { ...a.xf, ox: a.xf.ox + dx };
    const ids = new Set(items.slice(start).filter(Boolean).map((i) => i.id));
    for (const t of targets.values()) if (ids.has(t.item)) t.xf = { ...t.xf, ox: t.xf.ox + dx };
  }
  if (name) {
    const size = 32;
    const h = textHeight(name, size);
    items.splice(start, 0, { id: titleId, type: "text", x: round(left + dx), y: round(top - h - 24), w: textWidth(name, size), h, text: name, fontSize: size, bold: true });
    for (const a of pageArrows) a.at += 1;
  }
  const after = items.slice(start).filter((i) => i && i.type !== "line");
  return after.length ? Math.max(...after.map((b) => b.x + b.w)) : rightSoFar;
}
