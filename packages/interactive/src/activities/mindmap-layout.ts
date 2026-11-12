import type { MindmapNode } from "../core/index.js";

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = { nodeWidth: 176, nodeHeight: 48, gapX: 56, gapY: 14 };

export interface PlacedNode {
  node: MindmapNode;
  depth: number;
  x: number;
  y: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Index of the root's child this node descends from, for branch colours. -1 for the root. */
  branch: number;
  /** 1-based position among its siblings, and how many siblings there are. */
  position: number;
  siblings: number;
}

export interface MindmapLayout {
  /** Visible nodes in reading order (depth first). */
  nodes: PlacedNode[];
  width: number;
  height: number;
}

export function childrenByParent(nodes: readonly MindmapNode[]): Map<string | undefined, MindmapNode[]> {
  const map = new Map<string | undefined, MindmapNode[]>();
  for (const node of nodes) {
    const list = map.get(node.parent) ?? [];
    list.push(node);
    map.set(node.parent, list);
  }
  return map;
}

/**
 * A left-to-right tree: depth sets x, leaves stack down the page, and each
 * parent sits level with the middle of its children. Collapsed branches take
 * no space and aren't returned, so large maps stay cheap to draw.
 */
export function layoutMindmap(nodes: readonly MindmapNode[], collapsed: Readonly<Record<string, boolean>>, options: LayoutOptions = DEFAULT_LAYOUT): MindmapLayout {
  const children = childrenByParent(nodes);
  const root = children.get(undefined)?.[0];
  if (!root) return { nodes: [], width: 0, height: 0 };
  const placed: PlacedNode[] = [];
  let nextRow = 0;
  let maxDepth = 0;

  function place(node: MindmapNode, depth: number, branch: number, position: number, siblings: number): number {
    const kids = children.get(node.id) ?? [];
    const expanded = kids.length > 0 && !collapsed[node.id];
    const entry: PlacedNode = { node, depth, x: depth * (options.nodeWidth + options.gapX), y: 0, hasChildren: kids.length > 0, expanded, branch, position, siblings };
    placed.push(entry);
    maxDepth = Math.max(maxDepth, depth);
    if (!expanded) {
      entry.y = nextRow++ * (options.nodeHeight + options.gapY);
    } else {
      const ys = kids.map((kid, i) => place(kid, depth + 1, depth === 0 ? i : branch, i + 1, kids.length));
      entry.y = (ys[0]! + ys[ys.length - 1]!) / 2;
    }
    return entry.y;
  }

  place(root, 0, -1, 1, 1);
  return {
    nodes: placed,
    width: (maxDepth + 1) * options.nodeWidth + maxDepth * options.gapX,
    height: Math.max(1, nextRow) * (options.nodeHeight + options.gapY) - options.gapY,
  };
}

/** For maps too big to show at once: only the central topic and its children start open. */
export function defaultCollapsed(nodes: readonly MindmapNode[], threshold = 40): Record<string, boolean> {
  if (nodes.length <= threshold) return {};
  const children = childrenByParent(nodes);
  const collapsed: Record<string, boolean> = {};
  const walk = (node: MindmapNode, d: number) => {
    const kids = children.get(node.id) ?? [];
    if (d >= 1 && kids.length) collapsed[node.id] = true;
    kids.forEach((kid) => walk(kid, d + 1));
  };
  const root = children.get(undefined)?.[0];
  if (root) walk(root, 0);
  return collapsed;
}
