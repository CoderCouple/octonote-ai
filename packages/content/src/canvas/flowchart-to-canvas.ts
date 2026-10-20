/**
 * A parsed flowchart → a tldraw store snapshot (what canvases.document
 * holds): laid out with dagre, nodes as geo shapes, subgraphs as dashed
 * groups behind them, edges as arrows *bound* to their shapes so they follow
 * when someone drags a box. Every record is validated by tldraw's own schema
 * before the snapshot is returned, so a bad shape fails here — never in a
 * reader's browser.
 */
import dagre from "@dagrejs/dagre";
import { Store } from "@tldraw/store";
import {
  createBindingId,
  createShapeId,
  createTLSchema,
  DocumentRecordType,
  PageRecordType,
  TLDOCUMENT_ID,
  toRichText,
} from "@tldraw/tlschema";
import { getIndices } from "@tldraw/utils";
import type { FlowEdge, Flowchart, FlowNode, NodeShape } from "./mermaid-flowchart";

const PAGE_ID = "page:page";
const FONT = "sans";

/** Mermaid shape → tldraw geo, plus a size tweak for shapes that need room. */
const GEO: Record<NodeShape, { geo: string; widen: number; tall: number }> = {
  rectangle: { geo: "rectangle", widen: 1, tall: 1 },
  round: { geo: "rectangle", widen: 1, tall: 1 },
  subroutine: { geo: "rectangle", widen: 1, tall: 1 },
  stadium: { geo: "oval", widen: 1.15, tall: 1 },
  circle: { geo: "ellipse", widen: 1, tall: 1 },
  diamond: { geo: "diamond", widen: 1.45, tall: 1.6 },
  database: { geo: "rectangle", widen: 1, tall: 1 },
  flag: { geo: "rectangle", widen: 1, tall: 1 },
  hexagon: { geo: "hexagon", widen: 1.25, tall: 1.2 },
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CHAR_W = 8.5;
const PAD_X = 48;

/**
 * A label's box: roughly 8.5px per character at the "s" size. Wide labels are
 * capped at 320px and wrap, so the box grows a row for every wrapped line.
 */
function sizeFor(node: FlowNode): { w: number; h: number } {
  const lines = node.label.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.min(320, Math.max(120, longest * CHAR_W + PAD_X));
  const perRow = Math.max(1, Math.floor((w - PAD_X) / CHAR_W));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perRow)), 0);
  const base = { w, h: 56 + (rows - 1) * 22 };
  const g = GEO[node.shape];
  if (node.shape === "circle") {
    const d = Math.max(base.w, base.h + 24);
    return { w: d, h: d };
  }
  return { w: Math.round(base.w * g.widen), h: Math.round(base.h * g.tall) };
}

function layout(chart: Flowchart) {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: chart.direction, nodesep: 56, ranksep: 84, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const group of chart.groups) g.setNode(`group:${group.id}`, { label: group.title });
  for (const group of chart.groups) {
    if (group.parent) g.setParent(`group:${group.id}`, `group:${group.parent}`);
  }
  for (const node of chart.nodes) {
    const { w, h } = sizeFor(node);
    g.setNode(node.id, { width: w, height: h });
    if (node.group) g.setParent(node.id, `group:${node.group}`);
  }
  chart.edges.forEach((e, i) => {
    // Edge labels need room between ranks.
    g.setEdge(e.from, e.to, { width: e.label ? e.label.length * 7 + 16 : 0, height: e.label ? 24 : 0 }, `e${i}`);
  });
  dagre.layout(g);

  const boxOf = (id: string): Box => {
    const n = g.node(id) as { x: number; y: number; width: number; height: number };
    return { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height };
  };
  return {
    node: (id: string) => boxOf(id),
    group: (id: string) => {
      const b = boxOf(`group:${id}`);
      // Room for the title above the contents.
      return { x: b.x - 16, y: b.y - 40, w: b.w + 32, h: b.h + 56 };
    },
  };
}

export function flowchartToCanvas(chart: Flowchart) {
  const placed = layout(chart);
  const total = chart.groups.length + chart.nodes.length + chart.edges.length + 1;
  const indices = getIndices(total).slice(1);
  let next = 0;

  const base = (id: string, type: string, box: { x: number; y: number }, props: Record<string, unknown>) => ({
    id,
    typeName: "shape" as const,
    type,
    x: box.x,
    y: box.y,
    rotation: 0,
    index: indices[next++]!,
    parentId: PAGE_ID,
    isLocked: false,
    opacity: 1,
    meta: {},
    props,
  });
  const geo = (opts: {
    geo: string;
    box: Box;
    label: string;
    color?: string;
    fill?: string;
    dash?: string;
    align?: string;
    verticalAlign?: string;
  }) => ({
    geo: opts.geo,
    w: opts.box.w,
    h: opts.box.h,
    richText: toRichText(opts.label),
    color: opts.color ?? "black",
    labelColor: opts.color ?? "black",
    fill: opts.fill ?? "semi",
    dash: opts.dash ?? "draw",
    size: "s",
    font: FONT,
    align: opts.align ?? "middle",
    verticalAlign: opts.verticalAlign ?? "middle",
    growY: 0,
    url: "",
    scale: 1,
    flipX: false,
    flipY: false,
  });

  const records: unknown[] = [
    DocumentRecordType.create({ id: TLDOCUMENT_ID }),
    PageRecordType.create({ id: PAGE_ID as never, name: "Page 1", index: "a1" as never }),
  ];

  // Groups first (outermost first) so they sit behind their contents.
  const depth = (id: string): number => {
    const parent = chart.groups.find((g) => g.id === id)?.parent;
    return parent ? 1 + depth(parent) : 0;
  };
  for (const group of [...chart.groups].sort((a, b) => depth(a.id) - depth(b.id))) {
    const box = placed.group(group.id);
    records.push(
      base(createShapeId(`group-${group.id}`), "geo", box, geo({
        geo: "rectangle",
        box,
        label: group.title,
        color: "grey",
        fill: "none",
        dash: "dashed",
        align: "start",
        verticalAlign: "start",
      })),
    );
  }

  for (const node of chart.nodes) {
    const box = placed.node(node.id);
    const g = GEO[node.shape];
    records.push(
      base(createShapeId(`node-${node.id}`), "geo", box, geo({
        geo: g.geo,
        box,
        label: node.label,
        color: node.shape === "database" ? "blue" : "black",
        dash: node.shape === "subroutine" ? "solid" : "draw",
      })),
    );
  }

  chart.edges.forEach((edge, i) => records.push(...arrowRecords(edge, i, placed.node, base)));

  // Putting the records in a real store runs tldraw's validators.
  const store = new Store({
    schema: createTLSchema(),
    props: { defaultName: "", assets: {}, onMount: () => {} },
  } as never);
  store.put(records as never);
  return store.getStoreSnapshot();
}

function arrowRecords(
  edge: FlowEdge,
  i: number,
  boxOf: (id: string) => Box,
  base: (id: string, type: string, box: { x: number; y: number }, props: Record<string, unknown>) => unknown,
) {
  const from = boxOf(edge.from);
  const to = boxOf(edge.to);
  const c1 = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const c2 = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const id = createShapeId(`edge-${i}`);
  const arrow = base(id, "arrow", c1, {
    kind: "arc",
    labelColor: "black",
    color: edge.thick ? "black" : "grey",
    fill: "none",
    dash: edge.dashed ? "dashed" : "solid",
    size: edge.thick ? "m" : "s",
    arrowheadStart: edge.start ? "arrow" : "none",
    arrowheadEnd: edge.end ? "arrow" : "none",
    font: FONT,
    start: { x: 0, y: 0 },
    end: { x: c2.x - c1.x, y: c2.y - c1.y },
    bend: 0,
    richText: toRichText(edge.label),
    labelPosition: 0.5,
    scale: 1,
    elbowMidPoint: 0.5,
  });
  const bindings = (["start", "end"] as const).map((terminal) => ({
    id: createBindingId(`edge-${i}-${terminal}`),
    typeName: "binding",
    type: "arrow",
    fromId: id,
    toId: createShapeId(`node-${terminal === "start" ? edge.from : edge.to}`),
    meta: {},
    props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" },
  }));
  return [arrow, ...bindings];
}
