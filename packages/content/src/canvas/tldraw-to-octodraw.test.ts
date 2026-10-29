import { describe, expect, it } from "vitest";
// What tldraw's mermaid emitter wrote (frozen before it was deleted).
import flowchartSnapshot from "./fixtures/tldraw-flowchart-snapshot.json";
import { isOctodrawDocument, toOctodrawDocument } from "./canvas-document";
import type { CanvasItem, LineItem, PenItem, ShapeItem, TextItem } from "./octodraw-types";
import { isTldrawDocument, richTextToPlain, tldrawToOctodraw } from "./tldraw-to-octodraw";
// octodraw's own model (TS source), to check our output is what its editor expects.
import { distanceToLine, isCanvasDocument, lineBounds, lineGeometry, resolveLines } from "../../../octodraw/src/canvas/model";

type Rec = Record<string, any>;

/** tldraw's richText for plain text (one paragraph per line). */
const toRichText = (text: string) => ({
  type: "doc",
  content: text.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
});

/** Float16 bits for a value (normal range only — enough for test strokes). */
function f16(v: number): number {
  if (v === 0) return 0;
  const sign = v < 0 ? 0x8000 : 0;
  const a = Math.abs(v);
  const exp = Math.floor(Math.log2(a));
  return sign | ((exp + 15) << 10) | Math.round((a / 2 ** exp - 1) * 1024);
}

/** tldraw's current draw-path encoding: first point as float32 x,y,z, then float16 deltas. */
function encodePoints(points: { x: number; y: number }[]): string {
  const view = new DataView(new ArrayBuffer(12 + (points.length - 1) * 6));
  view.setFloat32(0, points[0]!.x, true);
  view.setFloat32(4, points[0]!.y, true);
  view.setFloat32(8, 0.5, true);
  for (let i = 1; i < points.length; i++) {
    view.setUint16(12 + (i - 1) * 6, f16(points[i]!.x - points[i - 1]!.x), true);
    view.setUint16(14 + (i - 1) * 6, f16(points[i]!.y - points[i - 1]!.y), true);
    view.setUint16(16 + (i - 1) * 6, 0, true);
  }
  return Buffer.from(view.buffer).toString("base64");
}

const shape = (id: string, type: string, x: number, y: number, props: Rec, extra: Rec = {}): Rec => ({
  id: `shape:${id}`,
  typeName: "shape",
  type,
  x,
  y,
  rotation: 0,
  index: extra.index ?? "a1",
  parentId: extra.parentId ?? "page:page",
  isLocked: false,
  opacity: 1,
  meta: {},
  props,
  ...extra,
});
const binding = (arrow: string, terminal: "start" | "end", to: string, anchor = { x: 0.5, y: 0.5 }, isPrecise = false): Rec => ({
  id: `binding:${arrow}-${terminal}`,
  typeName: "binding",
  type: "arrow",
  fromId: `shape:${arrow}`,
  toId: `shape:${to}`,
  meta: {},
  props: { terminal, normalizedAnchor: anchor, isExact: false, isPrecise, snap: "none" },
});

/** A hand-made tldraw editor snapshot, the shape the web app saved. */
function handMade() {
  const recs: Rec[] = [
    { id: "document:document", typeName: "document", gridSize: 10, name: "", meta: {} },
    { id: "page:page", typeName: "page", name: "Page 1", index: "a1", meta: {} },
    shape("frame1", "frame", 100, 100, { w: 400, h: 300, name: "Login flow", color: "black" }, { index: "a1" }),
    // Inside the frame: relative to it.
    shape("box", "geo", 20, 40, { geo: "rectangle", w: 120, h: 60, growY: 10, richText: toRichText("Sign in"), color: "blue", url: "https://octonote.ai/" }, { parentId: "shape:frame1", index: "a1" }),
    shape("oval", "geo", 200, 40, { geo: "oval", w: 100, h: 60, richText: toRichText("Token"), color: "light-green" }, { parentId: "shape:frame1", index: "a2" }),
    shape("note1", "note", 600, 100, { color: "black", growY: 0, scale: 1, richText: toRichText("Remember\nthe edge cases") }, { index: "a2" }),
    shape("text1", "text", 600, 400, { size: "l", w: 300, autoSize: true, scale: 1, textAlign: "middle", color: "red", richText: toRichText("Big title") }, { index: "a3" }),
    shape("spin", "geo", 800, 100, { geo: "diamond", w: 100, h: 100, richText: toRichText("") }, { index: "a4", rotation: Math.PI / 2 }),
    shape("draw1", "draw", 50, 600, {
      color: "violet",
      segments: [{ type: "free", path: encodePoints([{ x: 0, y: 0 }, { x: 50, y: 25 }, { x: 100, y: 100 }]) }],
      isComplete: true, isClosed: false, isPen: false, scale: 1, scaleX: 1, scaleY: 1,
    }, { index: "a5" }),
    shape("img", "image", 300, 600, { w: 160, h: 90, assetId: "asset:pic", url: "", altText: "" }, { index: "a6" }),
    { id: "asset:pic", typeName: "asset", type: "image", props: { src: "https://cdn.example.com/pic.png", name: "pic.png", w: 160, h: 90 }, meta: {} },
    shape("arrow1", "arrow", 0, 0, {
      arrowheadStart: "none", arrowheadEnd: "triangle", dash: "dotted", color: "grey",
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, bend: 20, richText: toRichText("next"),
    }, { index: "a7" }),
    binding("arrow1", "start", "box"),
    binding("arrow1", "end", "note1"),
    // A free arrow (no bindings), positioned by its own points.
    shape("arrow2", "arrow", 1000, 1000, { arrowheadStart: "arrow", arrowheadEnd: "none", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, richText: toRichText("") }, { index: "a8" }),
    shape("fig", "figure", 1200, 100, { w: 300, h: 200, label: "Architecture" }, { index: "a9", meta: { figureId: "fig_1" } }),
    shape("figkid", "geo", 16, 48, { geo: "ellipse", w: 80, h: 80, richText: toRichText("DB") }, { parentId: "shape:fig" }),
    shape("grp", "group", 1600, 0, {}, { index: "aA" }),
    shape("grpkid", "geo", 10, 10, { geo: "star", w: 50, h: 50, richText: toRichText("") }, { parentId: "shape:grp" }),
    shape("ln", "line", 0, 900, { color: "orange", dash: "dashed", spline: "line", points: { a1: { id: "a1", index: "a1", x: 0, y: 0 }, a2: { id: "a2", index: "a2", x: 200, y: 50 } } }, { index: "aB" }),
    shape("vid", "video", 0, 0, { w: 100, h: 100 }, { index: "aC" }),
    // Fidelity: a group title at the top left, dotted, patterned; a semi-filled box; a precise, bent arrow; a free bent arrow.
    shape("grouptitle", "geo", 2000, 500, { geo: "rectangle", w: 300, h: 200, richText: toRichText("Group"), align: "start-legacy", verticalAlign: "start", dash: "dotted", fill: "pattern" }, { index: "aD" }),
    shape("semi", "geo", 2400, 500, { geo: "rectangle", w: 100, h: 100, richText: toRichText(""), align: "end", verticalAlign: "end", fill: "semi", dash: "draw" }, { index: "aE" }),
    shape("arrow3", "arrow", 0, 0, { arrowheadEnd: "arrow", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, bend: -30, richText: toRichText("") }, { index: "aF" }),
    binding("arrow3", "start", "grouptitle", { x: 0.9, y: 0.1 }, true),
    binding("arrow3", "end", "semi", { x: 0.2, y: 0.9 }, false),
    shape("arrow4", "arrow", 2000, 0, { start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, bend: 40, richText: toRichText("") }, { index: "aG" }),
    shape("elbow", "arrow", 2000, 100, { kind: "elbow", start: { x: 0, y: 0 }, end: { x: 200, y: 50 }, bend: 40, richText: toRichText("") }, { index: "aH" }),
    { id: "camera:page:page", typeName: "camera", x: 0, y: 0, z: 1, meta: {} },
  ];
  return {
    document: { store: Object.fromEntries(recs.map((r) => [r.id, r])), schema: { schemaVersion: 2, sequences: { "com.tldraw.shape.draw": 5 } } },
    session: {},
  };
}

const byId = (items: CanvasItem[], id: string) => items.find((i) => i.id === id)!;

describe("tldraw → octodraw", () => {
  const doc = tldrawToOctodraw(handMade());
  const items = doc.items;

  it("maps each kind of shape and skips the unknown ones", () => {
    expect(isOctodrawDocument(doc)).toBe(true);
    expect(isCanvasDocument(doc)).toBe(true);
    const types = Object.fromEntries(items.map((i) => [i.id, i.type]));
    expect(types).toMatchObject({
      frame1: "shape", "frame1-title": "text", box: "shape", oval: "shape", note1: "sticky", text1: "text",
      spin: "shape", draw1: "pen", img: "image", arrow1: "line", arrow2: "line", fig: "shape",
      "fig-title": "text", figkid: "shape", grpkid: "shape", ln: "line",
    });
    expect(types.vid).toBeUndefined();
    expect(types.grp).toBeUndefined();
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("uses absolute positions through parents, keeps text, links, colors and rotation", () => {
    const box = byId(items, "box") as ShapeItem;
    expect(box).toMatchObject({ x: 120, y: 140, w: 120, h: 70, text: "Sign in", color: "blue", link: "https://octonote.ai/", shape: "rectangle" });
    expect(byId(items, "oval")).toMatchObject({ shape: "ellipse", color: "lime" });
    expect(byId(items, "note1")).toMatchObject({ x: 600, y: 100, w: 200, h: 200, text: "Remember\nthe edge cases" });
    expect((byId(items, "note1") as Rec).color).toBeUndefined();
    expect(byId(items, "text1")).toMatchObject({ text: "Big title", fontSize: 32, align: "center", color: "red" });
    // Rotated a quarter turn about tldraw's origin (top-left): the centre moves, rotation becomes 90°.
    const spin = byId(items, "spin") as ShapeItem;
    expect(spin.rotation).toBe(90);
    expect(spin.shape).toBe("diamond");
    expect(spin.x + spin.w / 2).toBeCloseTo(750);
    expect(spin.y + spin.h / 2).toBeCloseTo(150);
    expect(byId(items, "grpkid")).toMatchObject({ x: 1610, y: 10, shape: "rectangle" });
    expect(byId(items, "figkid")).toMatchObject({ x: 1216, y: 148, shape: "ellipse" });
  });

  it("turns frames and figures into titled rectangles drawn behind their contents", () => {
    const order = items.map((i) => i.id);
    expect(order.indexOf("frame1")).toBeLessThan(order.indexOf("box"));
    expect(order.indexOf("fig")).toBeLessThan(order.indexOf("figkid"));
    const title = byId(items, "frame1-title") as TextItem;
    expect(title.text).toBe("Login flow");
    expect(title.y + title.h).toBeLessThanOrEqual(100);
    const figTitle = byId(items, "fig-title") as TextItem;
    expect(figTitle).toMatchObject({ text: "Architecture", bold: true });
    expect(figTitle.y).toBeGreaterThan(100);
  });

  it("attaches bound arrows to their shapes, with heads, dash and label", () => {
    const a = byId(items, "arrow1") as LineItem;
    expect(a.start.item).toBe("box");
    expect(a.end.item).toBe("note1");
    expect(a).toMatchObject({ endArrow: true, dashed: true, text: "next", color: "gray" });
    expect(a.startArrow).toBeUndefined();
    const free = byId(items, "arrow2") as LineItem;
    expect(free.start).toEqual({ x: 1000, y: 1000 });
    expect(free.end).toEqual({ x: 1100, y: 1000 });
    expect(free).toMatchObject({ startArrow: true });
    expect(free.endArrow).toBeUndefined();
    expect(byId(items, "ln")).toMatchObject({ start: { x: 0, y: 900 }, end: { x: 200, y: 950 }, dashed: true, color: "orange" });
  });

  it("decodes draw strokes into normalized pen points and resolves image assets", () => {
    const pen = byId(items, "draw1") as PenItem;
    expect(pen).toMatchObject({ x: 50, y: 600, w: 100, h: 100, color: "purple" });
    expect(pen.points).toEqual([[0, 0], [0.5, 0.25], [1, 1]]);
    expect(byId(items, "img")).toMatchObject({ src: "https://cdn.example.com/pic.png", alt: "pic.png", w: 160, h: 90 });
  });

  it("leaves lines exactly where octodraw's editor would put them", () => {
    const resolved = resolveLines(doc as never);
    const lines = resolved.items.filter((i: Rec) => i.type === "line") as LineItem[];
    expect(lines.some((l) => l.bend && l.start.anchor)).toBe(true);
    for (const line of lines) {
      const ours = byId(items, line.id) as LineItem;
      // octodraw leaves free lines' boxes alone: ours must already include the curve.
      const box = line.start.item || line.end.item ? line : lineBounds(line.start, line.end, line.bend);
      for (const k of ["x", "y", "w", "h"] as const) expect(ours[k]).toBeCloseTo(box[k], 1);
      for (const e of ["start", "end"] as const) {
        expect(ours[e].x).toBeCloseTo(line[e].x, 1);
        expect(ours[e].y).toBeCloseTo(line[e].y, 1);
      }
    }
  });

  it("keeps label alignment, dashes and fills on geo shapes", () => {
    expect(byId(items, "grouptitle")).toMatchObject({ align: "left", valign: "top", dashed: true, fill: "tint" });
    const semi = byId(items, "semi") as ShapeItem;
    expect(semi).toMatchObject({ align: "right", valign: "bottom", fill: "none" });
    expect(semi.dashed).toBeUndefined();
    // tldraw's default fill is none; centred labels stay implicit.
    const box = byId(items, "box") as ShapeItem;
    expect(box.fill).toBe("none");
    expect(box.align).toBeUndefined();
    expect(box.valign).toBeUndefined();
  });

  it("keeps bends: octodraw's curve passes through tldraw's middle point", () => {
    // Bound ends are clipped differently from tldraw's, so the middle point lies on our curve, not exactly at its t = 0.5.
    // tldraw (curved-arrow.ts): middle = midpoint of the terminals + bend · (−dy, dx)/len.
    const middle = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: (a.x + b.x) / 2 - (bend * (b.y - a.y)) / len, y: (a.y + b.y) / 2 + (bend * (b.x - a.x)) / len };
    };
    // A free arrow: same ends, same bend; (0,0)→(200,0) bend 40 bulges down through (100, 40).
    const free = byId(items, "arrow4") as LineItem;
    expect(free).toMatchObject({ bend: 40, start: { x: 2000, y: 0 }, end: { x: 2200, y: 0 } });
    expect(lineGeometry(doc as never, free).mid).toEqual({ x: 2100, y: 40 });
    expect(free).toMatchObject({ y: 0, h: 40 });
    // Bound arrows: tldraw's terminals are the shapes' centres (imprecise) or the precise anchor.
    const a1 = byId(items, "arrow1") as LineItem;
    const box = byId(items, "box");
    const note = byId(items, "note1");
    const want1 = middle({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, { x: note.x + note.w / 2, y: note.y + note.h / 2 }, 20);
    expect(a1.bend).toBeGreaterThan(0);
    expect(distanceToLine(want1, lineGeometry(doc as never, a1))).toBeLessThan(1);
    const a3 = byId(items, "arrow3") as LineItem;
    expect(a3.start).toMatchObject({ item: "grouptitle", anchor: { x: 0.9, y: 0.1 } });
    // Imprecise: tldraw aims at the centre, whatever the stored anchor says.
    expect(a3.end.anchor).toBeUndefined();
    expect(a3.bend).toBeLessThan(0);
    const want3 = middle({ x: 2000 + 270, y: 500 + 20 }, { x: 2450, y: 550 }, -30);
    expect(distanceToLine(want3, lineGeometry(doc as never, a3))).toBeLessThan(1);
    // Elbow arrows are drawn straight.
    expect((byId(items, "elbow") as LineItem).bend).toBeUndefined();
  });

  it("converts what the old tldraw mermaid emitter stored: bound arrows become attached lines", () => {
    // flowchart LR / subgraph app [App servers] A[API] --> C{Cache hit?} end / U((User)) --> A / C -->|yes| R[(Redis)]
    const snap = flowchartSnapshot as unknown;
    expect(isTldrawDocument(snap)).toBe(true);
    const out = toOctodrawDocument(snap);
    const shapes = out.items.filter((i) => i.type === "shape") as ShapeItem[];
    const lines = out.items.filter((i) => i.type === "line") as LineItem[];
    expect(shapes).toHaveLength(5); // 4 nodes + the group
    expect(lines).toHaveLength(3);
    expect(byId(out.items, "node-C")).toMatchObject({ shape: "diamond", text: "Cache hit?" });
    expect(byId(out.items, "node-U")).toMatchObject({ shape: "ellipse" });
    const yes = lines.find((l) => l.text === "yes")!;
    expect(yes).toMatchObject({ start: { item: "node-C" }, end: { item: "node-R" }, endArrow: true });
    // The group comes first (behind).
    expect(out.items[0]!.id).toBe("group-app");
    // Same input → same output.
    expect(tldrawToOctodraw(snap)).toEqual(out);
  });

  it("places extra pages to the right under their names", () => {
    const store: Record<string, Rec> = {
      "page:a": { id: "page:a", typeName: "page", name: "One", index: "a1" },
      "page:b": { id: "page:b", typeName: "page", name: "Two", index: "a2" },
      "shape:x": shape("x", "geo", 0, 0, { geo: "rectangle", w: 100, h: 100 }, { parentId: "page:a" }),
      "shape:y": shape("y", "geo", 0, 0, { geo: "rectangle", w: 100, h: 100 }, { parentId: "page:b" }),
    };
    const out = tldrawToOctodraw({ store, schema: {} }).items;
    expect(byId(out, "x").x).toBe(0);
    expect(byId(out, "y").x).toBeGreaterThan(100);
    expect(out.filter((i) => i.type === "text").map((i) => (i as TextItem).text)).toEqual(["One", "Two"]);
  });

  it("is safe on malformed input", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { store: null }, { store: { a: 1, b: null } }, { document: { store: { "shape:z": { typeName: "shape", type: "geo", parentId: "page:p", props: null, x: "nan" } } } }]) {
      expect(() => tldrawToOctodraw(bad)).not.toThrow();
      expect(() => toOctodrawDocument(bad)).not.toThrow();
    }
    expect(tldrawToOctodraw(null)).toEqual({ version: 1, items: [] });
    expect(toOctodrawDocument(null)).toEqual({ version: 1, items: [] });
    // A shape with junk props still lands somewhere sane.
    const odd = tldrawToOctodraw({ document: { store: { "shape:z": { typeName: "shape", type: "geo", parentId: "page:p", props: null, x: "nan" } } } });
    expect(odd.items[0]).toMatchObject({ id: "z", type: "shape", x: 0, y: 0 });
    // Arrow bound to a shape that doesn't exist: free end.
    const dangling = tldrawToOctodraw({ store: {
      "page:p": { id: "page:p", typeName: "page", index: "a1" },
      "shape:a": shape("a", "arrow", 5, 5, { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }, { parentId: "page:p" }),
      "binding:b": binding("a", "end", "ghost"),
    } });
    expect((dangling.items[0] as LineItem).end).toEqual({ x: 15, y: 5 });
  });

  it("passes octodraw documents through and reads rich text", () => {
    const od = { version: 1 as const, items: [] };
    expect(toOctodrawDocument(od)).toBe(od);
    expect(isTldrawDocument(od)).toBe(false);
    expect(richTextToPlain(toRichText("a\nb"))).toBe("a\nb");
    expect(richTextToPlain({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] }] })).toBe("one");
  });
});
