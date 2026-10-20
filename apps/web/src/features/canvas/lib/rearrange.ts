import dagre from "@dagrejs/dagre";
import type { Editor, TLArrowBinding, TLShape, TLShapeId } from "tldraw";

/**
 * Rearrange: lays shapes out again, top to bottom (vertically) or left to
 * right (horizontally), so the arrows between them cross as little as
 * possible. The same layout engine (dagre) draws canvases from mermaid.
 *
 * Works on the selection, or the whole page when fewer than two shapes are
 * selected. A box that fully surrounds other boxes (a mermaid subgraph, or one
 * drawn by hand) is kept around them. One undo step reverses it.
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
 * where the original one was. Pure: no tldraw, so it can be tested.
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

/** Rearranges the editor's selection (or page). Returns false when there's nothing to do. */
export function rearrangeShapes(editor: Editor, direction: RearrangeDirection): boolean {
  const pageId = editor.getCurrentPageId();
  const topLevel = (id: TLShapeId): TLShape | undefined => {
    let shape = editor.getShape(id);
    while (shape && shape.parentId !== pageId) {
      shape = editor.getShape(shape.parentId as TLShapeId);
    }
    return shape;
  };

  const selected = editor.getSelectedShapeIds();
  const scope =
    selected.length >= 2
      ? [...new Set(selected.map((id) => topLevel(id)).filter((s) => !!s))]
      : editor.getCurrentPageShapes().filter((s) => s.parentId === pageId);

  const nodes = scope.filter(
    (s) => s.type !== "arrow" && s.type !== "line" && s.type !== "draw" && !s.isLocked,
  );
  if (nodes.length < 2) return false;
  const nodeIds = new Set<string>(nodes.map((s) => s.id));

  const boxes: RearrangeBox[] = [];
  for (const s of nodes) {
    const b = editor.getShapePageBounds(s.id);
    if (b) boxes.push({ id: s.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }

  // Arrows whose two ends are bound to boxes being rearranged.
  const arrows = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === "arrow");
  const edges: RearrangeInput["edges"] = [];
  for (const arrow of arrows) {
    const bindings = editor.getBindingsFromShape<TLArrowBinding>(arrow, "arrow");
    const start = bindings.find((b) => b.props.terminal === "start");
    const end = bindings.find((b) => b.props.terminal === "end");
    if (!start || !end) continue;
    const from = topLevel(start.toId)?.id;
    const to = topLevel(end.toId)?.id;
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const label = editor.getShapeUtil(arrow).getText(arrow) ?? "";
    edges.push({ from, to, label: label || undefined });
  }

  const placed = rearrangeLayout({ boxes, edges }, direction);
  editor.markHistoryStoppingPoint("rearrange");
  editor.run(() => {
    for (const s of nodes) {
      const p = placed.get(s.id);
      const was = boxes.find((b) => b.id === s.id);
      if (!p || !was) continue;
      // Move by the change in page bounds, so rotated shapes land right too.
      const update: Record<string, unknown> = {
        id: s.id,
        type: s.type,
        x: s.x + (p.x - was.x),
        y: s.y + (p.y - was.y),
      };
      if ((p.w !== was.w || p.h !== was.h) && "w" in s.props && "h" in s.props) {
        update.props = { w: p.w, h: p.h };
      }
      editor.updateShape(update as Parameters<Editor["updateShape"]>[0]);
    }
    // Straighten arrows between rearranged boxes; their ends follow the bindings.
    for (const arrow of arrows) {
      const ends = editor
        .getBindingsFromShape<TLArrowBinding>(arrow, "arrow")
        .map((b) => topLevel(b.toId)?.id);
      if (ends.length === 2 && ends.every((id) => id && nodeIds.has(id))) {
        editor.updateShape({ id: arrow.id, type: "arrow", props: { bend: 0 } });
      }
    }
  });
  return true;
}
