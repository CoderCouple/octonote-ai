import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { DiagramView, ViewNode } from '../view/view';
import {
  chooseNodeVariants,
  DEFAULT_TYPOGRAPHY,
  edgeLabel,
  estimateTextWidth,
  GROUP_METRICS,
  groupTitle,
  ICON_NODE_METRICS,
  NODE_METRICS,
  wrapText,
  LEGEND_METRICS,
  SHAPE_SIZING,
  type DiagramLayout,
  type LayoutLegend,
  type LayoutEdge,
  type LayoutNode,
  type LayoutOptions,
  type NodeVariant,
  type Point,
} from './layout';
import { placeLegend, routeEdges } from './route';

// Eraser-style layout. Instead of one compound ELK run (which reorders nodes
// inside groups and can't keep declaration order), each group is arranged on
// its own, inside out, as a flat graph of its direct children with declaration
// order enforced; the group is then sized around them and treated as one box
// by its parent. Edges are routed afterwards on the final geometry with
// Eraser's open-source corridor router (@eraserlabs/layout).

interface Footprint {
  width: number;
  height: number;
}

interface Measured extends Footprint {
  variant: NodeVariant;
  lines: string[];
  description: string[];
  /** Icon nodes: the text block under the icon. */
  label?: Footprint;
}

/** Children of one container, positioned relative to its content origin. */
interface Arrangement extends Footprint {
  positions: Map<string, Point>;
}

const elk = new ELK();
const ROOT = '__root__';
const DIAGRAM_PADDING = 24;

export async function layoutViewEraser(view: DiagramView, options: LayoutOptions): Promise<DiagramLayout> {
  const measure = options.measureText ?? estimateTextWidth;
  const type = options.typography ?? DEFAULT_TYPOGRAPHY;
  const wrap = options.wrap ?? true;
  const variants = chooseNodeVariants(view);
  const N = NODE_METRICS;
  const I = ICON_NODE_METRICS;
  const G = GROUP_METRICS;

  // --- 1. Measure leaves ----------------------------------------------------
  const measured = new Map<string, Measured>();
  const textBlock = (label: string, description: string | undefined, max: number) => {
    const lines = wrapText(label, type.node, max, measure);
    const desc = description ? wrapText(description, type.description, max, measure) : [];
    return {
      lines,
      description: desc,
      width: Math.max(...lines.map((l) => measure(l, type.node)), ...desc.map((l) => measure(l, type.description))),
      height: lines.length * type.node.size * type.node.lineHeight + desc.length * type.description.size * type.description.lineHeight,
    };
  };
  for (const node of view.nodes.values()) {
    if (node.kind === 'group') continue;
    const { label, properties } = node.source;
    const variant = variants.get(node.id) ?? 'card';
    if (variant === 'icon') {
      const text = textBlock(label, properties.description, wrap ? I.maxLabelWidth : Infinity);
      measured.set(node.id, {
        variant,
        lines: text.lines,
        description: text.description,
        label: { width: Math.ceil(text.width), height: Math.ceil(text.height) },
        // Footprint includes the label so siblings keep clear of it.
        width: Math.ceil(Math.max(I.size, text.width)),
        height: Math.ceil(I.size + I.labelGap + text.height),
      });
      continue;
    }
    const descriptionText = properties.description ?? (node.kind === 'collapsed' ? `${node.hiddenCount} ${node.hiddenCount === 1 ? 'item' : 'items'} inside` : undefined);
    const text = textBlock(label, descriptionText, wrap ? N.maxTextWidth : Infinity);
    const hasIcon = !!properties.icon || node.kind === 'collapsed';
    const sizing = SHAPE_SIZING[properties.shape ?? ''];
    const width = Math.max(N.minWidth, Math.ceil(text.width + N.paddingX * 2 + (hasIcon ? N.iconSize + N.iconGap : 0)));
    const height = Math.max(N.minHeight + (text.description.length ? 8 : 0), Math.ceil(Math.max(text.height, hasIcon ? N.iconSize : 0) + N.paddingY * 2));
    measured.set(node.id, {
      variant,
      lines: text.lines,
      description: text.description,
      width: Math.ceil(width * (sizing?.width ?? 1)),
      height: Math.max(height, sizing?.minHeight ?? 0),
    });
  }

  // --- 2. Arrange containers inside out --------------------------------------
  /** The direct child of `container` that contains `id` (or is `id`), if any. */
  const childOf = (container: string | null, id: string): string | undefined => {
    for (let cur: string | null = id; cur; cur = view.nodes.get(cur)?.parent ?? null) {
      if ((view.nodes.get(cur)?.parent ?? null) === container) return cur;
    }
    return undefined;
  };

  const arrangements = new Map<string | null, Arrangement>();
  const footprints = new Map<string, Footprint>();
  const titles = new Map<string, string>();

  // Root-level leaves tied to the diagram only by dashed or plain lines (catalogs,
  // checks, event buses) sit below the main layout in Eraser, not in the flow.
  const annotations = findAnnotations(view);
  const spine = findSpine(view);

  const arrange = async (container: string | null, allChildren: string[]): Promise<Arrangement> => {
    const children = container === null ? allChildren.filter((id) => !annotations.has(id)) : allChildren;
    for (const id of children) {
      const node = view.nodes.get(id)!;
      if (node.kind === 'group') {
        const inner = await arrange(id, node.children);
        const title = groupTitle(node.source.label, node.source.properties.description);
        titles.set(id, title);
        const titleWidth = measure(title, type.group) + (node.source.properties.icon ? 28 : 0) + G.padding * 2;
        footprints.set(id, { width: Math.ceil(Math.max(inner.width + G.padding * 2, titleWidth)), height: Math.ceil(inner.height + G.headerHeight + G.padding) });
      } else {
        footprints.set(id, measured.get(id)!);
      }
    }
    const edges: { id: string; sources: string[]; targets: string[] }[] = [];
    for (const edge of view.edges) {
      const a = childOf(container, edge.from);
      const b = childOf(container, edge.to);
      if (a && b && a !== b && children.includes(a) && children.includes(b)) {
        edges.push({
          id: `${edge.id}@${container ?? ROOT}`,
          sources: [a],
          targets: [b],
          // The main path of a flow is drawn as one straight line.
          ...(spine.has(edge.id) ? { layoutOptions: { 'elk.layered.priority.straightness': '10', 'elk.layered.priority.direction': '10' } } : {}),
        });
      }
    }
    const hasGroups = children.some((id) => view.nodes.get(id)?.kind === 'group');
    const graph: ElkNode = {
      id: container ?? ROOT,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': { right: 'RIGHT', left: 'LEFT', down: 'DOWN', up: 'UP' }[options.direction],
        'elk.spacing.nodeNode': hasGroups ? '48' : '36',
        'elk.layered.spacing.nodeNodeBetweenLayers': hasGroups ? '64' : '80',
        'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
        // Network simplex honours edge straightness priorities (the flow's main path).
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.padding': '[top=0,left=0,bottom=0,right=0]',
        // Unconnected siblings stack in one column (declaration order) instead of being packed into a grid.
        'elk.separateConnectedComponents': 'false',
        // Long chains wrap instead of stretching into a strip: Eraser keeps groups
        // roughly landscape (Data subnet under App subnet, lakehouse zig-zag).
        ...(container !== null ? { 'elk.layered.wrapping.strategy': 'MULTI_EDGE', 'elk.aspectRatio': '1.6' } : {}),
      },
      children: children.map((id) => ({ id, width: footprints.get(id)!.width, height: footprints.get(id)!.height })),
      edges,
    };
    const result = await elk.layout(graph);
    const positions = new Map<string, Point>();
    for (const child of result.children ?? []) positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
    placeNoBranches(children, positions, footprints, edges, view, spine, options.direction);
    alignSpine(children, positions, footprints, edges.filter((e) => spine.has(e.id.split('@')[0]!)), options.direction);
    alignGroupColumns(children, positions, footprints, view, options.direction);
    // Post-passes move things, so measure the arrangement from final positions.
    const arrangement = {
      width: Math.max(0, ...children.map((id) => positions.get(id)!.x + footprints.get(id)!.width)),
      height: Math.max(0, ...children.map((id) => positions.get(id)!.y + footprints.get(id)!.height)),
      positions,
    };
    if (container === null) placeAnnotations(arrangement, annotations, view, footprints, measured);
    arrangements.set(container, arrangement);
    return arrangement;
  };

  const root = await arrange(null, view.roots);

  // --- 3. Absolute geometry ----------------------------------------------------
  const nodes: LayoutNode[] = [];
  const place = (container: string | null, originX: number, originY: number, depth: number) => {
    const arrangement = arrangements.get(container)!;
    const children = container ? view.nodes.get(container)!.children : view.roots;
    for (const id of children) {
      const node = view.nodes.get(id)!;
      const pos = arrangement.positions.get(id);
      if (!pos) continue;
      const fp = footprints.get(id)!;
      const x = originX + pos.x;
      const y = originY + pos.y;
      if (node.kind === 'group') {
        nodes.push(layoutNode(node, { x, y, width: fp.width, height: fp.height }, [titles.get(id)!], [], 'card', container, depth));
        const inner = arrangements.get(id)!;
        // Center the contents horizontally when the title made the group wider.
        const innerX = x + G.padding + Math.max(0, (fp.width - G.padding * 2 - inner.width) / 2);
        place(id, innerX, y + G.headerHeight, depth + 1);
        continue;
      }
      const m = measured.get(id)!;
      if (m.variant === 'icon') {
        const iconX = x + (fp.width - I.size) / 2;
        const leaf = layoutNode(node, { x: iconX, y, width: I.size, height: I.size }, m.lines, m.description, 'icon', container, depth);
        leaf.labelBox = { x: x + (fp.width - m.label!.width) / 2, y: y + I.size + I.labelGap, width: m.label!.width, height: m.label!.height };
        nodes.push(leaf);
      } else {
        nodes.push(layoutNode(node, { x, y, width: fp.width, height: fp.height }, m.lines, m.description, 'card', container, depth));
      }
    }
  };
  place(null, DIAGRAM_PADDING, DIAGRAM_PADDING, 0);

  // --- 4. Route edges -----------------------------------------------------------
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = routeEdges(view, byId, options, type.edge, measure);

  const legend = placeLegend(view, nodes, edges, measure, type);

  const extents = [...(legend ? [legend] : []), ...nodes.flatMap((n) => [n, ...(n.labelBox ? [n.labelBox] : [])]), ...edges.flatMap((e) => (e.label ? [e.label] : []))];
  const maxX = Math.max(root.width + DIAGRAM_PADDING, ...extents.map((b) => b.x + b.width), ...edges.flatMap((e) => e.points.map((p) => p.x)));
  const maxY = Math.max(root.height + DIAGRAM_PADDING, ...extents.map((b) => b.y + b.height), ...edges.flatMap((e) => e.points.map((p) => p.y)));
  return { width: maxX + DIAGRAM_PADDING, height: maxY + DIAGRAM_PADDING, nodes, edges, legend };
}

/**
 * Groups side by side along the flow become equal, aligned columns (rows for
 * up/down flows), as Eraser draws pipelines of groups. Contents stay anchored
 * to the group's top, so only the group box grows.
 */
function alignGroupColumns(children: string[], positions: Map<string, Point>, footprints: Map<string, Footprint>, view: DiagramView, direction: LayoutOptions['direction']): void {
  const groups = children.filter((id) => view.nodes.get(id)?.kind === 'group');
  if (groups.length < 2) return;
  const horizontal = direction === 'right' || direction === 'left';
  const [pos, size, crossPos, crossSize] = horizontal ? (['x', 'width', 'y', 'height'] as const) : (['y', 'height', 'x', 'width'] as const);
  // Only groups that each own their slot along the flow (no two share a column).
  const overlaps = (a: string, b: string) => {
    const pa = positions.get(a)!;
    const pb = positions.get(b)!;
    return pa[pos] < pb[pos] + footprints.get(b)![size] && pb[pos] < pa[pos] + footprints.get(a)![size];
  };
  const columns = groups.filter((g) => !groups.some((o) => o !== g && overlaps(g, o)));
  if (columns.length < 2) return;
  const start = Math.min(...columns.map((g) => positions.get(g)![crossPos]));
  const end = Math.max(...columns.map((g) => positions.get(g)![crossPos] + footprints.get(g)![crossSize]));
  for (const g of columns) {
    // Never stretch a group over a sibling (e.g. a node placed beside it).
    const p = positions.get(g)!;
    const f = footprints.get(g)!;
    const clear = children.every((other) => {
      if (other === g) return true;
      const q = positions.get(other);
      const o = footprints.get(other);
      if (!q || !o) return true;
      const alongOverlap = p[pos] < q[pos] + o[size] && q[pos] < p[pos] + f[size];
      const crossOverlap = start < q[crossPos] + o[crossSize] && q[crossPos] < end;
      return !(alongOverlap && crossOverlap);
    });
    if (!clear) continue;
    p[crossPos] = start;
    f[crossSize] = end - start;
  }
}

/**
 * Straightens the flow's main path: walking along the flow, each spine target is
 * centered on its source across the flow axis, unless that would overlap a
 * sibling in the same rank.
 */
function alignSpine(children: string[], positions: Map<string, Point>, footprints: Map<string, Footprint>, spineEdges: { sources: string[]; targets: string[] }[], direction: LayoutOptions['direction']): void {
  if (spineEdges.length === 0) return;
  const vertical = direction === 'down' || direction === 'up';
  const [along, across, alongSize, acrossSize] = vertical ? (['y', 'x', 'height', 'width'] as const) : (['x', 'y', 'width', 'height'] as const);
  const centerAcross = (id: string) => positions.get(id)![across] + footprints.get(id)![acrossSize] / 2;
  const ordered = [...spineEdges].sort((a, b) => positions.get(a.sources[0]!)![along] - positions.get(b.sources[0]!)![along]);
  const moved = new Set<string>();
  for (const edge of ordered) {
    const [from, to] = [edge.sources[0]!, edge.targets[0]!];
    if (moved.has(to) || !children.includes(to)) continue;
    const target = centerAcross(from) - footprints.get(to)![acrossSize] / 2;
    const p = positions.get(to)!;
    const size = footprints.get(to)!;
    const clashes = children.some((other) => {
      if (other === to) return false;
      const q = positions.get(other);
      const f = footprints.get(other);
      if (!q || !f) return false;
      const sameRank = q[along] < p[along] + size[alongSize] && p[along] < q[along] + f[alongSize];
      return sameRank && q[across] < target + size[acrossSize] + 24 && target < q[across] + f[acrossSize] + 24;
    });
    if (clashes) continue;
    p[across] = target;
    moved.add(to);
  }
  // Shift everything back into positive space if centering pushed something past the origin.
  const min = Math.min(...children.map((id) => positions.get(id)?.[across] ?? 0));
  if (min < 0) for (const id of children) positions.get(id)![across] -= min;
}

/**
 * A decision's "no" branch goes beside it, on the same row (to the right in a
 * top-down flow, below in a left-right one), as Eraser draws flowcharts —
 * when the branch's target is off the main path and the spot is free.
 */
function placeNoBranches(children: string[], positions: Map<string, Point>, footprints: Map<string, Footprint>, edges: { id: string; sources: string[]; targets: string[] }[], view: DiagramView, spine: Set<string>, direction: LayoutOptions['direction']): void {
  const byId = new Map(view.edges.map((e) => [e.id, e]));
  const vertical = direction === 'down' || direction === 'up';
  const [along, across, alongSize, acrossSize] = vertical ? (['y', 'x', 'height', 'width'] as const) : (['x', 'y', 'width', 'height'] as const);
  // Nodes the main path leads into stay on it.
  const onSpine = new Set(edges.filter((e) => spine.has(e.id.split('@')[0]!)).map((e) => e.targets[0]!));
  const moved = new Set<string>();
  const GAP = 72;
  for (const edge of edges) {
    if (!/^no\b/i.test(byId.get(edge.id.split('@')[0]!)?.label ?? '')) continue;
    const [from, to] = [edge.sources[0]!, edge.targets[0]!];
    if (onSpine.has(to) || moved.has(to) || !children.includes(to)) continue;
    const src = positions.get(from)!;
    const srcSize = footprints.get(from)!;
    const size = footprints.get(to)!;
    const alongAt = src[along] + srcSize[alongSize] / 2 - size[alongSize] / 2;
    const acrossAt = src[across] + srcSize[acrossSize] + GAP;
    const target: Point = vertical ? { x: acrossAt, y: alongAt } : { x: alongAt, y: acrossAt };
    const clashes = children.some((other) => {
      if (other === to) return false;
      const q = positions.get(other);
      const f = footprints.get(other);
      if (!q || !f) return false;
      return q.x < target.x + size.width + 24 && target.x < q.x + f.width + 24 && q.y < target.y + size.height + 24 && target.y < q.y + f.height + 24;
    });
    if (clashes) continue;
    positions.set(to, target);
    moved.add(to);
  }
}

function findAnnotations(view: DiagramView): Set<string> {
  const annotations = new Set<string>();
  for (const id of view.roots) {
    const node = view.nodes.get(id)!;
    if (node.kind === 'group') continue;
    const incident = view.edges.filter((e) => e.from === id || e.to === id);
    if (incident.length > 0 && incident.every((e) => e.dashed || (!e.startArrow && !e.endArrow))) annotations.add(id);
  }
  // Keep at least the bulk of the diagram in the flow.
  return annotations.size < view.roots.length / 2 ? annotations : new Set();
}

/** Annotation nodes go in a row under the main layout, each under what it connects to. */
function placeAnnotations(arrangement: Arrangement, annotations: Set<string>, view: DiagramView, footprints: Map<string, Footprint>, measured: Map<string, Measured>): void {
  if (annotations.size === 0) return;
  const top = arrangement.height + 64;
  const centerOf = (id: string): number | undefined => {
    for (let cur: string | null = id; cur; cur = view.nodes.get(cur)?.parent ?? null) {
      const p = arrangement.positions.get(cur);
      if (p) return p.x + footprints.get(cur)!.width / 2;
    }
    return undefined;
  };
  const wanted = [...annotations].map((id) => {
    const neighbours = view.edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : [])).map(centerOf).filter((x): x is number => x !== undefined);
    const fp = measured.get(id)!;
    const cx = neighbours.length ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length : arrangement.width / 2;
    footprints.set(id, fp);
    return { id, x: cx - fp.width / 2, width: fp.width, height: fp.height };
  });
  wanted.sort((a, b) => a.x - b.x);
  let cursor = -Infinity;
  let bottom = top;
  for (const w of wanted) {
    const x = Math.max(w.x, cursor + 48);
    arrangement.positions.set(w.id, { x, y: top });
    cursor = x + w.width;
    bottom = Math.max(bottom, top + w.height);
  }
  arrangement.width = Math.max(arrangement.width, cursor);
  arrangement.height = bottom;
}

/**
 * The main path of a flow: from each node, its first outgoing edge in
 * declaration order that isn't a "no" branch, followed from the first node.
 */
function findSpine(view: DiagramView): Set<string> {
  const spine = new Set<string>();
  const firstOut = new Map<string, string>();
  for (const edge of view.edges) {
    if (edge.from === edge.to || /^no\b/i.test(edge.label ?? '')) continue;
    if (!firstOut.has(edge.from)) firstOut.set(edge.from, edge.id);
  }
  const byId = new Map(view.edges.map((e) => [e.id, e]));
  const seen = new Set<string>();
  // Walk from where flows begin (nothing points into them), so a branch that
  // loops back ("Show error > Start") doesn't count as the main path.
  const entered = new Set(view.edges.filter((e) => e.from !== e.to).map((e) => e.to));
  const starts = [...view.nodes.keys()].filter((id) => !entered.has(id));
  for (const start of starts.length ? starts : [...view.nodes.keys()].slice(0, 1)) {
    for (let cur: string | undefined = start; cur && !seen.has(cur); ) {
      seen.add(cur);
      const id = firstOut.get(cur);
      if (!id) break;
      spine.add(id);
      cur = byId.get(id)!.to;
    }
  }
  return spine;
}

function layoutNode(node: ViewNode, box: { x: number; y: number; width: number; height: number }, lines: string[], description: string[], variant: NodeVariant, parent: string | null, depth: number): LayoutNode {
  return {
    id: node.id,
    kind: node.kind,
    variant,
    ...box,
    lines,
    description,
    properties: node.source.properties,
    parent,
    depth,
    hiddenCount: node.hiddenCount,
  };
}

