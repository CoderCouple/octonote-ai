import type { DiagramView } from '../view/view';
import { DEFAULT_TYPOGRAPHY, estimateTextWidth, GROUP_METRICS, type DiagramLayout, type LayoutNode, type LayoutOptions, type Point } from './layout';
import { placeLegend, routeEdges } from './route';
import { groupHeaderExtra } from './style';

// Hand placement on top of the automatic layout: nodes the user moved (or
// groups they resized) keep that geometry, everything else stays where the
// layout put it, groups grow to keep their children inside, and edges are
// re-routed on the result. Placements live outside the diagram code, so the
// code stays Eraser-compatible.

/** Top-left corner (and, for groups and cards, size) in the automatic layout's coordinates. */
export interface NodePlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type NodePlacements = Record<string, NodePlacement>;

/** Placements per drill-down level: key '' is the top level, otherwise the focused group's id. */
export type ViewPlacements = Record<string, NodePlacements>;

/**
 * Hand placements after a box is renamed in the code: its own placement and
 * a drill level keyed by it move to the new name. Returns `all` unchanged
 * when nothing refers to the old name.
 */
export function renamePlacements(all: ViewPlacements, rename: { from: string; to: string }): ViewPlacements {
  let changed = false;
  const next: ViewPlacements = {};
  for (const [level, nodes] of Object.entries(all)) {
    const key = level === rename.from ? rename.to : level;
    const moved = { ...nodes };
    if (moved[rename.from]) {
      moved[rename.to] = moved[rename.from]!;
      delete moved[rename.from];
      changed = true;
    }
    if (key !== level) changed = true;
    next[key] = moved;
  }
  return changed ? next : all;
}

const PAD = 24;

export const placementKey = (focus: string | null | undefined) => focus ?? '';

export function canResizeNode(node: Pick<LayoutNode, 'kind' | 'variant'>): boolean {
  return node.kind === 'group' || ((node.kind === 'node' || node.kind === 'collapsed') && node.variant === 'card');
}

/**
 * Applies placements to an automatic layout. The result has an `offset`: when
 * moved nodes reach above or left of the diagram everything is shifted back
 * into view, and layout coordinates = placement coordinates + offset.
 */
export function arrangeLayout(view: DiagramView, auto: DiagramLayout, placements: NodePlacements | undefined, options: Pick<LayoutOptions, 'typography' | 'measureText'>): DiagramLayout {
  if (!placements || !auto.nodes.some((n) => placements[n.id])) return auto;
  const measure = options.measureText ?? estimateTextWidth;
  const type = options.typography ?? DEFAULT_TYPOGRAPHY;
  const G = GROUP_METRICS;

  // 1. Place nodes parents-first; unplaced descendants move with their group.
  const shift = new Map<string, Point>();
  const nodes: LayoutNode[] = auto.nodes.map((n) => {
    const inherited = (n.parent && shift.get(n.parent)) || { x: 0, y: 0 };
    const p = placements[n.id];
    const x = p ? p.x : n.x + inherited.x;
    const y = p ? p.y : n.y + inherited.y;
    const resizable = canResizeNode(n);
    const width = p?.width && resizable ? p.width : n.width;
    const height = p?.height && resizable ? p.height : n.height;
    const dx = x - n.x;
    const dy = y - n.y;
    shift.set(n.id, { x: dx, y: dy });
    return { ...n, x, y, width, height, labelBox: n.labelBox && { ...n.labelBox, x: n.labelBox.x + dx, y: n.labelBox.y + dy } };
  });

  // 2. Groups grow (never shrink) to keep their children inside, innermost first.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let i = nodes.length - 1; i >= 0; i--) {
    const g = nodes[i]!;
    if (g.kind !== 'group') continue;
    const children = nodes.filter((n) => n.parent === g.id);
    if (!children.length) continue;
    const boxes = children.flatMap((c) => [c, ...(c.labelBox ? [c.labelBox] : [])]);
    const left = Math.min(g.x, ...boxes.map((b) => b.x - G.padding));
    const top = Math.min(g.y, ...boxes.map((b) => b.y - G.headerHeight - groupHeaderExtra(g.properties)));
    const right = Math.max(g.x + g.width, ...boxes.map((b) => b.x + b.width + G.padding));
    const bottom = Math.max(g.y + g.height, ...boxes.map((b) => b.y + b.height + G.padding));
    Object.assign(g, { x: left, y: top, width: right - left, height: bottom - top });
  }

  // 3. Route edges and place the legend on the new geometry.
  const edges = routeEdges(view, byId, options as LayoutOptions, type.edge, measure);
  const legend = placeLegend(view, nodes, edges, measure, type);

  // 4. Shift back into view if anything moved past the top-left padding.
  const boxes = [...nodes, ...nodes.flatMap((n) => (n.labelBox ? [n.labelBox] : [])), ...edges.flatMap((e) => (e.label ? [e.label] : [])), ...(legend ? [legend] : [])];
  const points = edges.flatMap((e) => e.points);
  const minX = Math.min(...boxes.map((b) => b.x), ...points.map((p) => p.x));
  const minY = Math.min(...boxes.map((b) => b.y), ...points.map((p) => p.y));
  const offset = { x: Math.max(0, PAD - minX), y: Math.max(0, PAD - minY) };
  if (offset.x || offset.y) {
    const move = <T extends { x: number; y: number }>(b: T): T => ({ ...b, x: b.x + offset.x, y: b.y + offset.y });
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      nodes[i] = { ...move(n), labelBox: n.labelBox && move(n.labelBox) };
    }
    for (const e of edges) {
      e.points = e.points.map(move);
      if (e.label) e.label = move(e.label);
    }
    if (legend) Object.assign(legend, move(legend));
  }
  const all = [...nodes, ...nodes.flatMap((n) => (n.labelBox ? [n.labelBox] : [])), ...edges.flatMap((e) => (e.label ? [e.label] : [])), ...(legend ? [legend] : [])];
  const maxX = Math.max(...all.map((b) => b.x + b.width), ...edges.flatMap((e) => e.points.map((p) => p.x)));
  const maxY = Math.max(...all.map((b) => b.y + b.height), ...edges.flatMap((e) => e.points.map((p) => p.y)));
  return { width: maxX + PAD, height: maxY + PAD, nodes, edges, legend, offset };
}
