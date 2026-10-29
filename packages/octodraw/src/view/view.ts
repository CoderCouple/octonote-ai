import type { Diagram, DiagramEdge, DiagramNode, Legend } from '../dsl/types';

// A drill-down view is one level of the group hierarchy: the children of the
// focused group (or the top level), with deeper groups optionally collapsed,
// nodes outside the focus shown as externals, and edges re-attached to
// whatever represents their endpoints at this level.

export interface ViewOptions {
  /** Group to drill into, or null for the top level. */
  focus: string | null;
  /**
   * How many group levels below the focus are shown expanded. Deeper groups
   * render as collapsed, drillable boxes. `collapsed: true|false` on a group
   * overrides this. Defaults to Infinity (everything expanded, like Eraser).
   */
  expandDepth?: number;
  /**
   * Replace "every child of a group connects to X the same way" with a single
   * group-level edge, as Eraser does. Defaults to true.
   */
  mergeGroupEdges?: boolean;
  /** Groups the user collapsed; they render as single boxes whatever their depth. */
  collapsedGroups?: ReadonlySet<string>;
}

export type ViewNodeKind = 'node' | 'group' | 'collapsed' | 'external';

export interface ViewNode {
  id: string;
  kind: ViewNodeKind;
  source: DiagramNode;
  /** Parent view node id, or null at the view's top level. */
  parent: string | null;
  children: string[];
  /** Number of descendants hidden inside a collapsed group. */
  hiddenCount: number;
}

export interface ViewEdge {
  id: string;
  from: string;
  to: string;
  startArrow: boolean;
  endArrow: boolean;
  dashed: boolean;
  label?: string;
  color?: string;
  /** Source edges merged into this one (more than one when groups are collapsed). */
  sources: DiagramEdge[];
  /** Stands for identical edges from (or to) every child of a group. */
  groupFan?: boolean;
}

export interface DiagramView {
  focus: string | null;
  /** Focus first, root last: e.g. ['API', 'VPC', 'Company']. */
  path: string[];
  nodes: Map<string, ViewNode>;
  roots: string[];
  edges: ViewEdge[];
  legend?: Legend;
}

export function buildView(diagram: Diagram, options: ViewOptions): DiagramView {
  const { focus, expandDepth = Infinity, mergeGroupEdges = true, collapsedGroups } = options;
  const focusNode = focus ? diagram.nodes.get(focus) : undefined;
  const effectiveFocus = focusNode?.kind === 'group' ? focusNode.id : null;

  const nodes = new Map<string, ViewNode>();
  const roots: string[] = [];

  const add = (node: DiagramNode, parent: string | null, depth: number) => {
    const expanded = node.kind === 'group' && !collapsedGroups?.has(node.id) && isExpanded(node, depth, expandDepth);
    const viewNode: ViewNode = {
      id: node.id,
      kind: node.kind === 'group' ? (expanded ? 'group' : 'collapsed') : 'node',
      source: node,
      parent,
      children: [],
      hiddenCount: expanded ? 0 : countDescendants(diagram, node),
    };
    nodes.set(node.id, viewNode);
    if (parent) nodes.get(parent)!.children.push(node.id);
    else roots.push(node.id);
    if (expanded) {
      for (const child of node.children) add(diagram.nodes.get(child)!, node.id, depth + 1);
    }
  };

  const topLevel = effectiveFocus ? diagram.nodes.get(effectiveFocus)!.children : diagram.roots;
  for (const id of topLevel) add(diagram.nodes.get(id)!, null, 0);

  // Maps a diagram node to the visible node that stands in for it, or to an
  // external marker when it lies outside the focused subtree.
  const represent = (id: string): { id: string; external: boolean } | undefined => {
    if (effectiveFocus && !isWithin(diagram, id, effectiveFocus)) return { id, external: true };
    for (let cur: string | null = id; cur; cur = diagram.nodes.get(cur)!.parent) {
      if (nodes.has(cur)) return { id: cur, external: false };
    }
    // Only reachable for the focus group itself.
    return undefined;
  };

  const merged = new Map<string, ViewEdge>();
  for (const edge of diagram.edges) {
    const from = represent(edge.from);
    const to = represent(edge.to);
    if (!from || !to || from.id === to.id) continue;
    if (from.external && to.external) continue;
    for (const end of [from, to]) {
      if (end.external && !nodes.has(end.id)) {
        nodes.set(end.id, { id: end.id, kind: 'external', source: diagram.nodes.get(end.id)!, parent: null, children: [], hiddenCount: 0 });
        roots.push(end.id);
      }
    }
    const key = `${from.id}\u0000${to.id}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        id: edge.id,
        from: from.id,
        to: to.id,
        startArrow: edge.startArrow,
        endArrow: edge.endArrow,
        dashed: edge.dashed,
        label: edge.label,
        color: edge.properties.color,
        sources: [edge],
      });
      continue;
    }
    existing.sources.push(edge);
    existing.startArrow ||= edge.startArrow;
    existing.endArrow ||= edge.endArrow;
    existing.dashed &&= edge.dashed;
    if (existing.label !== edge.label) existing.label = undefined;
    if (existing.color !== edge.properties.color) existing.color = undefined;
  }

  const edges = [...merged.values()];
  return {
    focus: effectiveFocus,
    path: effectiveFocus ? ancestry(diagram, effectiveFocus) : [],
    nodes,
    roots,
    edges: mergeGroupEdges ? mergeFanIntoGroups(nodes, edges) : edges,
    legend: diagram.legend,
  };
}

/**
 * When every direct child of an expanded group has an identical, unlabeled
 * edge to the same outside node, those edges collapse into one edge from (or
 * to) the group itself. The merged edge is placed where the first one was.
 */
function mergeFanIntoGroups(nodes: Map<string, ViewNode>, edges: ViewEdge[]): ViewEdge[] {
  let result = edges;
  for (const group of nodes.values()) {
    if (group.kind !== 'group' || group.children.length < 2) continue;
    const children = new Set(group.children);
    for (const side of ['from', 'to'] as const) {
      const other = side === 'from' ? 'to' : 'from';
      const byTarget = new Map<string, ViewEdge[]>();
      for (const edge of result) {
        if (!children.has(edge[side]) || children.has(edge[other]) || edge[other] === group.id || edge.label) continue;
        const key = `${edge[other]}\u0000${edge.startArrow}${edge.endArrow}${edge.dashed}${edge.color ?? ''}`;
        byTarget.set(key, [...(byTarget.get(key) ?? []), edge]);
      }
      for (const fan of byTarget.values()) {
        if (new Set(fan.map((e) => e[side])).size !== children.size) continue;
        const first = fan[0]!;
        const replacement: ViewEdge = { ...first, id: `${first.id}-group`, [side]: group.id, sources: fan.flatMap((e) => e.sources), groupFan: true };
        const drop = new Set(fan);
        result = result.flatMap((e) => (e === first ? [replacement] : drop.has(e) ? [] : [e]));
      }
    }
  }
  return result;
}

/** Groups that can be drilled into from this view. */
export function canDrillInto(view: DiagramView, id: string): boolean {
  const node = view.nodes.get(id);
  return !!node && node.kind !== 'external' && node.source.kind === 'group' && node.source.children.length > 0;
}

function isExpanded(node: DiagramNode, depth: number, expandDepth: number): boolean {
  const flag = node.properties.collapsed;
  if (flag === 'true') return false;
  if (flag === 'false') return true;
  return depth < expandDepth;
}

function countDescendants(diagram: Diagram, node: DiagramNode): number {
  let count = 0;
  for (const child of node.children) count += 1 + countDescendants(diagram, diagram.nodes.get(child)!);
  return count;
}

function isWithin(diagram: Diagram, id: string, ancestor: string): boolean {
  for (let cur = diagram.nodes.get(id)?.parent ?? null; cur; cur = diagram.nodes.get(cur)!.parent) {
    if (cur === ancestor) return true;
  }
  return false;
}

function ancestry(diagram: Diagram, id: string): string[] {
  const path: string[] = [];
  for (let cur: string | null = id; cur; cur = diagram.nodes.get(cur)!.parent) path.push(cur);
  return path;
}
