/**
 * A parsed flowchart (or class diagram) → an octodraw canvas document, laid
 * out with dagre: subgraphs as gray containers (with a title) drawn behind
 * their contents, nodes as shapes, edges as lines *attached* to their shapes
 * so they follow when someone drags a box. Pure and deterministic: ids come
 * from the mermaid ids (`node-A`, `group-app`, `edge-0`).
 */
import { GROUP_TITLE_ROOM, layoutFlowchart, withoutEmptyGroups } from "./flowchart-layout";
import type { Flowchart, NodeShape } from "./mermaid-flowchart";
import {
  settleLines,
  type CanvasDocument,
  type CanvasItem,
  type LineItem,
  type ShapeItem,
  type ShapeKind,
  type TextItem,
} from "./octodraw-types";

/** Mermaid shape → octodraw shape (octodraw has rectangles, ellipses and diamonds). */
const SHAPE: Record<NodeShape, ShapeKind> = {
  rectangle: "rectangle",
  round: "rectangle",
  subroutine: "rectangle",
  stadium: "rectangle",
  circle: "ellipse",
  diamond: "diamond",
  database: "rectangle",
  flag: "rectangle",
  hexagon: "rectangle",
};

const GROUP_TITLE_SIZE = 14;

export function flowchartToOctodraw(input: Flowchart): CanvasDocument {
  const chart = withoutEmptyGroups(input);
  const placed = layoutFlowchart(chart);
  const items: CanvasItem[] = [];

  // Containers first (outermost first) so they sit behind their contents;
  // each container's title right after it.
  const groups = chart.groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => placed.depth(a.g.id) - placed.depth(b.g.id) || a.i - b.i)
    .map(({ g }) => g);
  for (const group of groups) {
    const box = placed.group(group.id);
    items.push({ id: `group-${group.id}`, type: "shape", shape: "rectangle", ...box, color: "gray" } satisfies ShapeItem);
    if (group.title) {
      const h = Math.ceil(GROUP_TITLE_SIZE * 1.3) + 2;
      items.push({
        id: `group-${group.id}-title`,
        type: "text",
        x: box.x + 12,
        y: box.y + (GROUP_TITLE_ROOM - h) / 2,
        w: Math.max(24, Math.min(box.w - 24, Math.ceil(group.title.length * GROUP_TITLE_SIZE * 0.56) + 6)),
        h,
        text: group.title,
        fontSize: GROUP_TITLE_SIZE,
        bold: true,
        color: "gray",
      } satisfies TextItem);
    }
  }

  for (const node of chart.nodes) {
    const shape: ShapeItem = {
      id: `node-${node.id}`,
      type: "shape",
      shape: SHAPE[node.shape],
      ...placed.node(node.id),
      text: node.label,
    };
    if (node.shape === "database") shape.color = "blue";
    if (node.url) shape.link = node.url;
    items.push(shape);
  }

  chart.edges.forEach((edge, i) => {
    const from = placed.end(edge.from);
    const to = placed.end(edge.to);
    const fromId = from.kind === "node" ? `node-${edge.from}` : `group-${edge.from}`;
    const toId = to.kind === "node" ? `node-${edge.to}` : `group-${edge.to}`;
    const line: LineItem = {
      id: `edge-${i}`,
      type: "line",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      start: { x: from.box.x + from.box.w / 2, y: from.box.y + from.box.h / 2, item: fromId },
      end: { x: to.box.x + to.box.w / 2, y: to.box.y + to.box.h / 2, item: toId },
    };
    // Class diagrams use other heads (triangle, diamond); octodraw draws one kind.
    if (edge.startHead ? edge.startHead !== "none" : edge.start) line.startArrow = true;
    if (edge.endHead ? edge.endHead !== "none" : edge.end) line.endArrow = true;
    if (edge.dashed) line.dashed = true;
    if (edge.label) line.text = edge.label;
    items.push(line);
  });

  return { version: 1, items: settleLines(items) };
}
