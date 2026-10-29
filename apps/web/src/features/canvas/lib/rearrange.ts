import dagre from "@dagrejs/dagre";
import { resolveLines, type CanvasDocument, type CanvasItem } from "@octonote/octodraw";

/**
 * Rearrange: lays shapes out again, top to bottom (vertically) or left to
 * right (horizontally), so the arrows between them cross as little as
 * possible. The same layout engine (dagre) draws canvases from mermaid.
 *
 * Works on the selection, or the whole page when fewer than two shapes are
 * selected. A box that fully surrounds other boxes (a mermaid subgraph, or one
 * drawn by hand) is kept around them. Returns a new document, so the host's
 * history makes it one undo step.
 */

export type RearrangeDirection = "vertical" | "horizontal";

export interface RearrangeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RearrangeInput {
  /** Shapes to place; containers are worked out from these. */
  boxes: RearrangeBox[];
  /** Arrows between boxes, with their label (for room between rows). */
  edges: { from: string; to: string; label?: string }[];
}

const NODE_SEP = 56;
const RANK_SEP = 84;
/** Space inside a container: sides, title above, bottom. */
const PAD = { x: 16, top: 40, bottom: 16 };

const area = (b: RearrangeBox) => b.w * b.h;
const surrounds = (outer: RearrangeBox, inner: RearrangeBox) =>
  outer !== inner &&
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.w >= inner.x + inner.w &&
  outer.y + outer.h >= inner.y + inner.h &&
  area(outer) > area(inner);

/**
 * New positions (and sizes, for containers), with the result's top-left corner
 * where the original one was. Pure, so it can be tested.
 */
export function rearrangeLayout(
  input: RearrangeInput,
  direction: RearrangeDirection,
): Map<string, RearrangeBox> {
  const { boxes } = input;
  // Each box's parent is the smallest other box that surrounds it.
  const parentOf = new Map<string, string>();
  for (const b of boxes) {
    const around = boxes
      .filter((o) => surrounds(o, b))
      .sort((a, c) => area(a) - area(c))[0];
    if (around) parentOf.set(b.id, around.id);
  }
  const containers = new Set(parentOf.values());

  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir: direction === "vertical" ? "TB" : "LR",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const b of boxes) {
    g.setNode(
      b.id,
      containers.has(b.id)
        ? { paddingTop: PAD.top, paddingBottom: PAD.bottom, paddingLeft: PAD.x, paddingRight: PAD.x }
        : { width: b.w, height: b.h },
    );
  }
  for (const [child, parent] of parentOf) g.setParent(child, parent);
  input.edges.forEach((e, i) => {
    // dagre can't route arrows to a container itself; those are left alone.
    if (containers.has(e.from) || containers.has(e.to)) return;
    if (!g.hasNode(e.from) || !g.hasNode(e.to) || e.from === e.to) return;
    g.setEdge(
      e.from,
      e.to,
      { width: e.label ? e.label.length * 7 + 16 : 0, height: e.label ? 24 : 0 },
      `e${i}`,
    );
  });
  dagre.layout(g);

  const placed = new Map<string, RearrangeBox>();
  for (const b of boxes) {
    const n = g.node(b.id) as { x: number; y: number; width: number; height: number };
    const w = containers.has(b.id) ? n.width + PAD.x * 2 : b.w;
    const h = containers.has(b.id) ? n.height + PAD.top + PAD.bottom : b.h;
    // Containers grow outward for their title and padding.
    const x = n.x - n.width / 2 - (containers.has(b.id) ? PAD.x : 0);
    const y = n.y - n.height / 2 - (containers.has(b.id) ? PAD.top : 0);
    placed.set(b.id, { id: b.id, x, y, w, h });
  }

  // Keep the drawing where it was: same top-left corner as before.
  const minOf = (list: RearrangeBox[]) => ({
    x: Math.min(...list.map((b) => b.x)),
    y: Math.min(...list.map((b) => b.y)),
  });
  const before = minOf(boxes);
  const after = minOf([...placed.values()]);
  for (const b of placed.values()) {
    b.x += before.x - after.x;
    b.y += before.y - after.y;
  }
  return placed;
}

/** Items that take part as boxes (not lines, pen strokes or locked items). */
const isBox = (item: CanvasItem) =>
  item.type !== "line" && item.type !== "pen" && !item.locked;

/**
 * Rearranges the selection (or every item when fewer than two are selected).
 * Returns the new document, or null when there's nothing to do.
 */
export function rearrangeDocument(
  doc: CanvasDocument,
  selection: string[],
  direction: RearrangeDirection,
): CanvasDocument | null {
  const scope =
    selection.length >= 2
      ? doc.items.filter((i) => selection.includes(i.id))
      : doc.items;
  const nodes = scope.filter(isBox);
  if (nodes.length < 2) return null;
  const nodeIds = new Set(nodes.map((n) => n.id));

  const boxes: RearrangeBox[] = nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  // Arrows whose two ends are attached to boxes being rearranged.
  const edges: RearrangeInput["edges"] = [];
  for (const item of doc.items) {
    if (item.type !== "line") continue;
    const from = item.start.item;
    const to = item.end.item;
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push({ from, to, label: item.text || undefined });
  }

  const placed = rearrangeLayout({ boxes, edges }, direction);
  const items = doc.items.map((item) => {
    const p = placed.get(item.id);
    if (!p) return item;
    const resized = p.w !== item.w || p.h !== item.h;
    return {
      ...item,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      // A resized figure no longer follows its diagram's natural size.
      ...(resized && item.type === "figure" ? { autoSize: false } : {}),
    } as CanvasItem;
  });
  // Attached arrow ends follow their boxes.
  return resolveLines({ ...doc, items });
}
