/**
 * Lays a parsed flowchart (or class diagram) out with dagre — shared by the
 * octodraw canvas emitter. Pure; returns boxes
 * in canvas units with the top-left corner at (x, y).
 */
import dagre from "@dagrejs/dagre";
import type { Flowchart, FlowNode, NodeShape } from "./mermaid-flowchart";

export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How much wider/taller a mermaid shape needs to be than its label box. */
const SHAPE_SIZE: Record<NodeShape, { widen: number; tall: number }> = {
  rectangle: { widen: 1, tall: 1 },
  round: { widen: 1, tall: 1 },
  subroutine: { widen: 1, tall: 1 },
  stadium: { widen: 1.15, tall: 1 },
  circle: { widen: 1, tall: 1 },
  diamond: { widen: 1.45, tall: 1.6 },
  database: { widen: 1, tall: 1 },
  flag: { widen: 1, tall: 1 },
  hexagon: { widen: 1.25, tall: 1.2 },
};

const CHAR_W = 8.5;
const PAD_X = 48;

/**
 * A label's box: roughly 8.5px per character at the "s" size. Wide labels are
 * capped at 320px and wrap, so the box grows a row for every wrapped line.
 */
export function sizeFor(node: FlowNode): { w: number; h: number } {
  const lines = node.label.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.min(320, Math.max(120, longest * CHAR_W + PAD_X));
  const perRow = Math.max(1, Math.floor((w - PAD_X) / CHAR_W));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perRow)), 0);
  const base = { w, h: 56 + (rows - 1) * 22 };
  const g = SHAPE_SIZE[node.shape];
  if (node.shape === "circle") {
    const d = Math.max(base.w, base.h + 24);
    return { w: d, h: d };
  }
  return { w: Math.round(base.w * g.widen), h: Math.round(base.h * g.tall) };
}

/**
 * Drops subgraphs that ended up with nothing inside (dagre lays an empty
 * cluster out at NaN) and edges that touch one.
 */
export function withoutEmptyGroups(chart: Flowchart): Flowchart {
  const live = new Set(chart.nodes.map((n) => n.group).filter((g): g is string => g !== null));
  // A parent with a live child is live too.
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of chart.groups) {
      if (g.parent && live.has(g.id) && !live.has(g.parent)) {
        live.add(g.parent);
        grew = true;
      }
    }
  }
  const ids = new Set([...chart.nodes.map((n) => n.id), ...live]);
  return {
    ...chart,
    groups: chart.groups.filter((g) => live.has(g.id)),
    edges: chart.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}

export interface FlowLayout {
  node: (id: string) => LayoutBox;
  /** A subgraph's box, with room for its title above the contents. */
  group: (id: string) => LayoutBox;
  /** An edge end: a node, or a whole subgraph. */
  end: (id: string) => { box: LayoutBox; kind: "node" | "group" };
  /** Nesting depth of a subgraph (0 = top level). */
  depth: (id: string) => number;
}

/** Height reserved above a subgraph's contents for its title. */
export const GROUP_TITLE_ROOM = 40;

export function layoutFlowchart(chart: Flowchart): FlowLayout {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: chart.direction, nodesep: 56, ranksep: 84, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const group of chart.groups) g.setNode(`group:${group.id}`, { label: group.title });
  for (const group of chart.groups) {
    if (group.parent) g.setParent(`group:${group.id}`, `group:${group.parent}`);
  }
  const isNode = new Set(chart.nodes.map((n) => n.id));
  for (const node of chart.nodes) {
    const { w, h } = sizeFor(node);
    g.setNode(node.id, { width: w, height: h });
    if (node.group) g.setParent(node.id, `group:${node.group}`);
  }
  chart.edges.forEach((e, i) => {
    // dagre can't route edges to a subgraph; those are drawn after layout.
    if (!isNode.has(e.from) || !isNode.has(e.to)) return;
    // Edge labels need room between ranks.
    g.setEdge(e.from, e.to, { width: e.label ? e.label.length * 7 + 16 : 0, height: e.label ? 24 : 0 }, `e${i}`);
  });
  dagre.layout(g);

  const boxOf = (id: string): LayoutBox => {
    const n = g.node(id) as { x: number; y: number; width: number; height: number };
    return { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height };
  };
  const group = (id: string): LayoutBox => {
    const b = boxOf(`group:${id}`);
    return { x: b.x - 16, y: b.y - GROUP_TITLE_ROOM, w: b.w + 32, h: b.h + GROUP_TITLE_ROOM + 16 };
  };
  const depth = (id: string, seen = 0): number => {
    const parent = chart.groups.find((x) => x.id === id)?.parent;
    return parent && seen < 50 ? 1 + depth(parent, seen + 1) : 0;
  };
  return {
    node: boxOf,
    group,
    end: (id) => (isNode.has(id) ? { box: boxOf(id), kind: "node" } : { box: group(id), kind: "group" }),
    depth,
  };
}
