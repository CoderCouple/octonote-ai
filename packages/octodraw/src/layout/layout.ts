import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { Direction, Properties } from '../dsl/types';
import type { DiagramView, ViewEdge, ViewNode, ViewNodeKind } from '../view/view';
import { straightRoute } from './straight';
import { edgeFont as edgeFontFor, edgeStyle, edgeStyleFields, groupFont, groupHeaderExtra, iconSizeOf, nodeFonts } from './style';

// Positions a drill-down view with ELK's layered algorithm. Only the nodes in
// the current view are laid out, so drilling into a large diagram stays cheap.

export type TextMeasurer = (text: string, font: TextFont) => number;

export interface TextFont {
  size: number;
  weight: number;
  /** A box's own `typeface` (clean / mono / rough), when it differs from the diagram's; measurers may use it. */
  typeface?: string;
}

export interface Typography {
  node: TextFont & { lineHeight: number };
  description: TextFont & { lineHeight: number };
  group: TextFont;
  edge: TextFont & { lineHeight: number };
}

export interface LayoutOptions {
  direction: Direction;
  /** Text styles used to size nodes; must match the renderer's. Defaults to the theme defaults. */
  typography?: Typography;
  /** Width of a single line of text; defaults to an average-glyph estimate. */
  measureText?: TextMeasurer;
  /** Wrap long labels onto several lines. */
  wrap?: boolean;
  /**
   * `eraser` (default): groups arranged inside out with declaration order kept,
   * edges routed by Eraser's corridor router. `elk`: one compound ELK pass.
   */
  engine?: 'eraser' | 'elk';
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutNode {
  id: string;
  kind: ViewNodeKind;
  /** Absolute position of the top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * `card`: a box with the icon on the left and centered text. `icon`: a bare
   * 50px icon with its text underneath (Eraser's default for icon nodes); x/y/
   * width/height are the icon's box and `labelBox` is the text block.
   */
  variant: NodeVariant;
  labelBox?: { x: number; y: number; width: number; height: number };
  lines: string[];
  /** Secondary text under the label (the `description` property, or the hidden count of a collapsed group). */
  description: string[];
  properties: Properties;
  /** Explicit colors (from imported Eraser JSON); override the palette in light mode. */
  style?: { fill?: string; stroke?: string };
  /** Enclosing group in the view, or null at the top level. */
  parent: string | null;
  /** Nesting depth inside the view; 0 for top-level nodes. */
  depth: number;
  hiddenCount: number;
}

export type NodeVariant = 'card' | 'icon';

/** Arrowhead drawn at an end of a line: filled triangle, open chevron or round dot. */
export type ArrowHeadKind = 'arrow' | 'open' | 'dot';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  startArrow: boolean;
  endArrow: boolean;
  dashed: boolean;
  /** `line: dotted` (wins over `dashed`). */
  dotted?: boolean;
  /**
   * Explicit arrowheads from `startArrow` / `endArrow`. When unset, the ends
   * follow the connector: a filled triangle at the end, and at the start a
   * filled triangle (`<`) or an open chevron (`<>`).
   */
  startHead?: ArrowHeadKind;
  endHead?: ArrowHeadKind;
  /** `strokeWidth`; unset draws the theme's edge width. */
  strokeWidth?: number;
  /** `labelSize`: the label's font size; unset uses the theme's edge text. */
  labelSize?: number;
  /** `routing: straight`: a straight line between the two outlines instead of a routed path. */
  routing?: 'straight';
  color?: string;
  label?: { text: string; x: number; y: number; width: number; height: number };
  /** How many source connections were merged into this edge. */
  count: number;
}

export interface LayoutLegend {
  x: number;
  y: number;
  width: number;
  height: number;
  items: { label: string; connection?: string; color?: string; icon?: string; shape?: string }[];
}

export interface DiagramLayout {
  width: number;
  height: number;
  /** Parents come before their children, so drawing in order layers correctly. */
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  legend?: LayoutLegend;
  /** Set by arrangeLayout when hand-placed nodes shifted the drawing: layout = placement coordinates + offset. */
  offset?: Point;
}

/**
 * Room a shape needs beyond a rectangle to fit the same text: width factor and
 * minimum height (diamonds, stars and triangles waste their corners).
 */
export const SHAPE_SIZING: Record<string, { width: number; minHeight: number }> = {
  diamond: { width: 1.5, minHeight: 96 },
  hexagon: { width: 1.25, minHeight: 64 },
  star: { width: 1.7, minHeight: 120 },
  triangle: { width: 1.7, minHeight: 104 },
  parallelogram: { width: 1.2, minHeight: 56 },
  trapezoid: { width: 1.25, minHeight: 56 },
  ellipse: { width: 1.25, minHeight: 64 },
  document: { width: 1, minHeight: 64 },
  cylinder: { width: 1, minHeight: 72 },
};

export const LEGEND_METRICS = { padding: 12, titleHeight: 22, rowHeight: 24, swatchWidth: 32, gap: 10, margin: 48 };

// Keep in sync with lightTheme.text; layout runs without a theme in tests.
export const DEFAULT_TYPOGRAPHY: Typography = {
  node: { size: 16, weight: 400, lineHeight: 1.3 },
  description: { size: 12, weight: 400, lineHeight: 1.35 },
  group: { size: 16, weight: 400 },
  edge: { size: 12, weight: 450, lineHeight: 1.3 },
};

// Geometry measured from Eraser's generated diagrams (corpus/*.json).
export const NODE_METRICS = {
  minWidth: 160,
  maxTextWidth: 220,
  paddingX: 18,
  paddingY: 10,
  minHeight: 56,
  iconSize: 24,
  iconGap: 14,
};
export const ICON_NODE_METRICS = { size: 50, labelGap: 8, maxLabelWidth: 130 };
export const GROUP_METRICS = { headerTop: 18, headerHeight: 58, padding: 32 };

const FLOWCHART_SHAPES = new Set(['diamond', 'oval', 'ellipse', 'circle']);

/**
 * Card or icon, following what Eraser generates (checked against the corpus
 * in test/variants.test.ts): whole diagrams render as cards when they are
 * flowcharts or most nodes carry a description; otherwise
 * nodes with an icon render as bare icons, except flowchart shapes, nodes
 * without an icon, and groups that are mostly cylinders (data stores).
 */
export function chooseNodeVariants(view: DiagramView): Map<string, NodeVariant> {
  const leaves = [...view.nodes.values()].filter((n) => n.kind === 'node');
  const variants = new Map<string, NodeVariant>();
  const shape = (n: ViewNode) => n.source.properties.shape;
  // A flowchart has decision/terminal shapes as a real share of its nodes (06: 57%); a
  // single approval diamond in an architecture diagram (03: 7%) keeps icons.
  const flowchart = leaves.filter((n) => FLOWCHART_SHAPES.has(shape(n) ?? '')).length >= leaves.length * 0.25;
  const allCards = flowchart || leaves.filter((n) => n.source.properties.description).length >= leaves.length * 0.6;
  const cylinderGroups = new Set<string | null>();
  const byParent = new Map<string | null, ViewNode[]>();
  for (const n of leaves) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  for (const [parent, siblings] of byParent) {
    if (siblings.filter((n) => shape(n) === 'cylinder').length >= siblings.length / 2 && siblings.length > 1) cylinderGroups.add(parent);
  }
  for (const n of view.nodes.values()) {
    const card = n.kind !== 'node' || allCards || !n.source.properties.icon || !!shape(n) && shape(n) !== 'cylinder' || cylinderGroups.has(n.parent);
    variants.set(n.id, card ? 'card' : 'icon');
  }
  return variants;
}

/** Group header text: Eraser shows the description inline, "Forkway · software system". */
export function groupTitle(label: string, description: string | undefined): string {
  return description ? `${label} · ${description}` : label;
}

const ELK_DIRECTION: Record<Direction, string> = { right: 'RIGHT', left: 'LEFT', down: 'DOWN', up: 'UP' };

const elk = new ELK();

export const estimateTextWidth: TextMeasurer = (text, font) => text.length * font.size * (font.weight >= 600 ? 0.6 : 0.56);

export async function layoutView(view: DiagramView, options: LayoutOptions): Promise<DiagramLayout> {
  if ((options.engine ?? 'eraser') === 'eraser') {
    const { layoutViewEraser } = await import('./eraserLayout');
    return layoutViewEraser(view, options);
  }
  return layoutViewElk(view, options);
}

async function layoutViewElk(view: DiagramView, options: LayoutOptions): Promise<DiagramLayout> {
  const measure = options.measureText ?? estimateTextWidth;
  const typography = options.typography ?? DEFAULT_TYPOGRAPHY;
  const { edge: EDGE_FONT } = typography;
  const wrap = options.wrap ?? true;
  const lines = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  const N = NODE_METRICS;
  const G = GROUP_METRICS;
  const I = ICON_NODE_METRICS;
  const variants = chooseNodeVariants(view);

  const toElk = (node: ViewNode): ElkNode => {
    const { label, properties } = node.source;
    const { node: LABEL_FONT, description: DESCRIPTION_FONT } = nodeFonts(typography, properties);
    if (node.kind === 'group') {
      const title = groupTitle(label, properties.description);
      lines.set(node.id, [title]);
      descriptions.set(node.id, []);
      const headerWidth = measure(title, groupFont(typography, properties)) + (properties.icon ? 28 : 0);
      return {
        id: node.id,
        layoutOptions: {
          'elk.padding': `[top=${G.headerHeight + groupHeaderExtra(properties)},left=${G.padding},bottom=${G.padding + 6},right=${G.padding}]`,
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': `(${Math.ceil(headerWidth + G.padding * 2)}, 60)`,
        },
        children: node.children.map((id) => toElk(view.nodes.get(id)!)),
      };
    }
    if (variants.get(node.id) === 'icon') {
      const size = iconSizeOf(properties.iconSize) ?? I.size;
      const max = wrap ? Math.max(I.maxLabelWidth, size) : Infinity;
      const text = wrapText(label, LABEL_FONT, max, measure);
      const description = properties.description ? wrapText(properties.description, DESCRIPTION_FONT, max, measure) : [];
      lines.set(node.id, text);
      descriptions.set(node.id, description);
      const width = Math.max(...text.map((line) => measure(line, LABEL_FONT)), ...description.map((line) => measure(line, DESCRIPTION_FONT)));
      const height = text.length * LABEL_FONT.size * LABEL_FONT.lineHeight + description.length * DESCRIPTION_FONT.size * DESCRIPTION_FONT.lineHeight;
      // The label sits outside, under the icon; ELK reserves room for it in the node's margins.
      return {
        id: node.id,
        width: size,
        height: size,
        labels: [{ text: label, width: Math.ceil(width), height: Math.ceil(height) }],
        layoutOptions: { 'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER', 'elk.spacing.labelNode': String(I.labelGap) },
      };
    }
    const hasIcon = !!properties.icon || node.kind === 'collapsed';
    const maxText = wrap ? N.maxTextWidth : Infinity;
    const text = wrapText(label, LABEL_FONT, maxText, measure);
    const descriptionText = properties.description ?? (node.kind === 'collapsed' ? `${node.hiddenCount} ${node.hiddenCount === 1 ? 'item' : 'items'} inside` : undefined);
    const description = descriptionText ? wrapText(descriptionText, DESCRIPTION_FONT, maxText, measure) : [];
    lines.set(node.id, text);
    descriptions.set(node.id, description);
    const textWidth = Math.max(...text.map((line) => measure(line, LABEL_FONT)), ...description.map((line) => measure(line, DESCRIPTION_FONT)));
    const textHeight = text.length * LABEL_FONT.size * LABEL_FONT.lineHeight + description.length * DESCRIPTION_FONT.size * DESCRIPTION_FONT.lineHeight;
    return {
      id: node.id,
      width: Math.max(N.minWidth, Math.ceil(textWidth + N.paddingX * 2 + (hasIcon ? N.iconSize + N.iconGap : 0))),
      height: Math.max(N.minHeight, Math.ceil(Math.max(textHeight, hasIcon ? N.iconSize : 0) + N.paddingY * 2)),
    };
  };

  const edges: ElkExtendedEdge[] = view.edges.map((edge) => {
    const text = edgeLabel(edge);
    const font = edgeFontFor(EDGE_FONT, edge);
    return {
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
      labels: text
        ? [{ text, width: Math.ceil(measure(text, font) + 8), height: Math.ceil(font.size * font.lineHeight + 4) }]
        : [],
    };
  });

  const graph: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[options.direction],
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // Prefer declaration order within a layer, as Eraser does. (Forcing it
      // with forceNodeModelOrder reorders compound nodes badly.)
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Break cycles by declaration order: an edge back to an earlier-declared
      // node is the loop-back, so flows read top-down like Eraser's (Start first).
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      // Weigh declaration order against crossings when ordering nodes in a layer.
      'elk.layered.considerModelOrder.crossingCounterNodeInfluence': '0.6',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: view.roots.map((id) => toElk(view.nodes.get(id)!)),
    edges,
  };

  const result = await elk.layout(graph);

  const nodes: LayoutNode[] = [];
  const offsets = new Map<string, Point>([['__root__', { x: 0, y: 0 }]]);
  const visit = (elkNode: ElkNode, origin: Point, depth: number, parent: string | null) => {
    const x = origin.x + (elkNode.x ?? 0);
    const y = origin.y + (elkNode.y ?? 0);
    offsets.set(elkNode.id, { x, y });
    const viewNode = view.nodes.get(elkNode.id)!;
    const variant = variants.get(elkNode.id) ?? 'card';
    const elkLabel = elkNode.labels?.[0];
    nodes.push({
      variant,
      labelBox:
        variant === 'icon' && elkLabel
          ? { x: x + (elkLabel.x ?? 0), y: y + (elkLabel.y ?? (elkNode.height ?? I.size) + I.labelGap), width: elkLabel.width ?? 0, height: elkLabel.height ?? 0 }
          : undefined,
      id: elkNode.id,
      kind: viewNode.kind,
      x,
      y,
      width: elkNode.width ?? 0,
      height: elkNode.height ?? 0,
      lines: lines.get(elkNode.id) ?? [],
      description: descriptions.get(elkNode.id) ?? [],
      properties: viewNode.source.properties,
      parent,
      depth,
      hiddenCount: viewNode.hiddenCount,
    });
    for (const child of elkNode.children ?? []) visit(child, { x, y }, depth + 1, elkNode.id);
  };
  for (const child of result.children ?? []) visit(child, { x: 0, y: 0 }, 0, null);

  const viewEdges = new Map(view.edges.map((edge) => [edge.id, edge]));
  const placed = new Map(nodes.map((n) => [n.id, n]));
  const layoutEdges: LayoutEdge[] = (result.edges ?? []).map((elkEdge) => {
    const edge = viewEdges.get(elkEdge.id)!;
    const style = edgeStyle(edge);
    // ELK reports edge coordinates relative to the edge's container node.
    const origin = offsets.get((elkEdge as ElkExtendedEdge & { container?: string }).container ?? '__root__') ?? { x: 0, y: 0 };
    const points: Point[] = [];
    for (const section of elkEdge.sections ?? []) {
      for (const p of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
        points.push({ x: origin.x + p.x, y: origin.y + p.y });
      }
    }
    const label = elkEdge.labels?.[0];
    if (style.routing === 'straight') {
      // A straight line between the outlines; the label sits on its middle.
      const straight = straightRoute(placed.get(edge.from)!, placed.get(edge.to)!);
      points.splice(0, points.length, ...straight);
      if (label) {
        label.x = (straight[0]!.x + straight[1]!.x) / 2 - (label.width ?? 0) / 2 - origin.x;
        label.y = (straight[0]!.y + straight[1]!.y) / 2 - (label.height ?? 0) / 2 - origin.y;
      }
    }
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      points,
      ...edgeStyleFields(style),
      color: edge.color,
      count: edge.groupFan ? 1 : edge.sources.length,
      label:
        label?.text !== undefined
          ? { text: label.text, x: origin.x + (label.x ?? 0), y: origin.y + (label.y ?? 0), width: label.width ?? 0, height: label.height ?? 0 }
          : undefined,
    };
  });

  return { width: result.width ?? 0, height: result.height ?? 0, nodes, edges: layoutEdges };
}

export function edgeLabel(edge: ViewEdge): string | undefined {
  // Counts mark edges merged into a collapsed group; a group fan edge (all children → X) has none.
  if (edge.sources.length > 1 && !edge.groupFan) return edge.label ? `${edge.label} ×${edge.sources.length}` : `×${edge.sources.length}`;
  return edge.label;
}

/** Greedy word wrap; explicit `\n` always breaks. */
export function wrapText(text: string, font: TextFont, maxWidth: number, measure: TextMeasurer): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, font) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}
