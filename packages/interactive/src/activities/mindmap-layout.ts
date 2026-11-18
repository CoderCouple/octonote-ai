import type { MindmapNode } from "../core/index.js";

/**
 * Mind map layout: the central topic in the middle, its branches split
 * between the right and the left, each branch a tidy tree growing outwards.
 * Every node is sized to its own text, which is wrapped here (not by the
 * browser) from an estimate of glyph widths, so the server and the browser
 * agree to the pixel, nothing is measured from the DOM, and the export draws
 * exactly what's on screen.
 */

export type Side = "right" | "left";
export type Direction = "both" | "right";

/** How a node at each depth is drawn: the root, the main branches, then everything below. */
export interface NodeStyle {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  padX: number;
  padY: number;
  /** Widest the text may run before it wraps. */
  maxText: number;
  minWidth: number;
  maxLines: number;
}

export const NODE_STYLES: readonly [NodeStyle, NodeStyle, NodeStyle] = [
  { fontSize: 17, fontWeight: 700, lineHeight: 22, padX: 20, padY: 12, maxText: 220, minWidth: 112, maxLines: 4 },
  { fontSize: 14, fontWeight: 600, lineHeight: 19, padX: 14, padY: 8, maxText: 200, minWidth: 64, maxLines: 4 },
  { fontSize: 13, fontWeight: 500, lineHeight: 18, padX: 6, padY: 4, maxText: 200, minWidth: 32, maxLines: 4 },
];

export const styleAt = (depth: number): NodeStyle => NODE_STYLES[Math.min(depth, 2)]!;

/** Space between a parent and its children (by the parent's depth), and between siblings (by their depth). */
const GAP_X = [64, 40, 32] as const;
const GAP_Y = [0, 18, 8] as const;
const gapX = (depth: number) => GAP_X[Math.min(depth, 2)]!;
const gapY = (depth: number) => GAP_Y[Math.min(depth, 2)]!;

export interface PlacedNode {
  node: MindmapNode;
  depth: number;
  /** Top-left corner and size, in map pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The label wrapped to fit, with an ellipsis if it ran past the last line. */
  lines: string[];
  /** Which side of the root this node grows to. The root reports "right". */
  side: Side;
  hasChildren: boolean;
  expanded: boolean;
  /** Every node below this one, shown or not. */
  descendants: number;
  /** Index of the root's child this node descends from, for branch colours. -1 for the root. */
  branch: number;
  /** 1-based position among its siblings, and how many siblings there are. */
  position: number;
  siblings: number;
}

export interface MindmapLayout {
  /** Visible nodes in reading order (depth first, parents before children). */
  nodes: PlacedNode[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** "both" splits the branches around the root; "right" grows everything to the right. Defaults to both once the root has three branches. */
  direction?: Direction;
  /** Labels to draw instead of the spec's (the learner's renames). */
  labels?: Readonly<Record<string, string>>;
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

// Glyph widths in ems for a UI sans-serif, rounded up so text never runs past its box.
const NARROW = new Set("il.,:;'!|ijtf()[]{}`\"".split(""));
const SEMI = new Set("rIJ-/\\ s".split(""));
const WIDE = new Set("mwMW@%&".split(""));

function charWidth(ch: string): number {
  if (NARROW.has(ch)) return 0.32;
  if (ch === " ") return 0.29;
  if (SEMI.has(ch)) return 0.46;
  if (WIDE.has(ch)) return 0.9;
  if (ch >= "0" && ch <= "9") return 0.6;
  if (ch >= "A" && ch <= "Z") return 0.7;
  if (ch >= "a" && ch <= "z") return 0.56;
  const code = ch.codePointAt(0) ?? 0;
  // CJK, kana, hangul and emoji take a full em.
  if (code >= 0x2e80 || (code >= 0x1100 && code <= 0x11ff)) return 1;
  return 0.64;
}

/** Estimated width of a line of text, in pixels. */
export function textWidth(text: string, style: Pick<NodeStyle, "fontSize" | "fontWeight">): number {
  let em = 0;
  for (const ch of text) em += charWidth(ch);
  const weight = style.fontWeight >= 700 ? 1.07 : style.fontWeight >= 600 ? 1.04 : 1;
  return Math.ceil(em * style.fontSize * weight * 0.98);
}

/** Wraps text into lines no wider than the style allows, breaking long words if it has to. */
export function wrapText(text: string, style: NodeStyle): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, style) <= style.maxText) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = "";
    // A single word wider than a line is split across lines.
    let rest = word;
    while (textWidth(rest, style) > style.maxText) {
      let cut = rest.length - 1;
      while (cut > 1 && textWidth(rest.slice(0, cut), style) > style.maxText) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  };
  words.forEach(push);
  if (line) lines.push(line);
  if (lines.length <= style.maxLines) return lines;
  const kept = lines.slice(0, style.maxLines);
  let last = kept[kept.length - 1]!;
  while (last.length > 1 && textWidth(`${last}…`, style) > style.maxText) last = last.slice(0, -1);
  kept[kept.length - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** A node's box for its label: wrapped lines, then the padding around them. */
export function sizeNode(label: string, depth: number): { lines: string[]; w: number; h: number } {
  const style = styleAt(depth);
  const lines = wrapText(label, style);
  const widest = Math.max(...lines.map((l) => textWidth(l, style)));
  return { lines, w: Math.max(style.minWidth, widest + style.padX * 2), h: lines.length * style.lineHeight + style.padY * 2 };
}

/**
 * Lays out the visible part of the map. Collapsed branches take no space and
 * aren't returned, so big maps stay cheap to draw. Coordinates are whole
 * pixels, starting at 0,0.
 */
export function layoutMindmap(nodes: readonly MindmapNode[], collapsed: Readonly<Record<string, boolean>>, options: LayoutOptions = {}): MindmapLayout {
  const children = childrenByParent(nodes);
  const root = children.get(undefined)?.[0];
  if (!root) return { nodes: [], width: 0, height: 0 };
  const labels = options.labels ?? {};

  const descendants = new Map<string, number>();
  const countBelow = (node: MindmapNode): number => {
    const n = (children.get(node.id) ?? []).reduce((sum, kid) => sum + 1 + countBelow(kid), 0);
    descendants.set(node.id, n);
    return n;
  };
  countBelow(root);

  const sizes = new Map<string, ReturnType<typeof sizeNode>>();
  const sizeOf = (node: MindmapNode, depth: number) => {
    let s = sizes.get(node.id);
    if (!s) sizes.set(node.id, (s = sizeNode(labels[node.id] ?? node.label, depth)));
    return s;
  };
  const shown = (node: MindmapNode) => (collapsed[node.id] ? [] : (children.get(node.id) ?? []));

  // Height of a node's visible subtree.
  const heights = new Map<string, number>();
  const heightOf = (node: MindmapNode, depth: number): number => {
    const own = sizeOf(node, depth).h;
    const kids = shown(node);
    const below = kids.reduce((sum, kid, i) => sum + heightOf(kid, depth + 1) + (i ? gapY(depth + 1) : 0), 0);
    const h = Math.max(own, below);
    heights.set(node.id, h);
    return h;
  };

  const rootKids = children.get(root.id) ?? [];
  const direction = options.direction ?? (rootKids.length >= 3 ? "both" : "right");
  const rootShown = shown(root);
  rootShown.forEach((kid) => heightOf(kid, 1));

  // Split the branches so both sides are about as tall; the first half reads down the right.
  let right = rootShown;
  let left: MindmapNode[] = [];
  if (direction === "both" && rootShown.length > 1) {
    const total = rootShown.reduce((sum, kid) => sum + heights.get(kid.id)!, 0);
    let acc = 0;
    let cut = rootShown.length;
    for (let i = 0; i < rootShown.length; i++) {
      acc += heights.get(rootShown[i]!.id)!;
      if (acc >= total / 2) {
        // Put the middle branch on whichever side leaves them closer to even.
        const before = acc - heights.get(rootShown[i]!.id)!;
        cut = Math.abs(total - 2 * acc) <= Math.abs(total - 2 * before) ? i + 1 : i;
        break;
      }
    }
    cut = Math.min(Math.max(cut, 1), rootShown.length - 1);
    right = rootShown.slice(0, cut);
    left = rootShown.slice(cut);
  }

  const out = new Map<string, PlacedNode>();
  const rootSize = sizeOf(root, 0);
  const rootKidsAll = children.get(root.id) ?? [];
  out.set(root.id, {
    node: root,
    depth: 0,
    x: -rootSize.w / 2,
    y: -rootSize.h / 2,
    w: rootSize.w,
    h: rootSize.h,
    lines: rootSize.lines,
    side: "right",
    hasChildren: rootKidsAll.length > 0,
    expanded: rootKidsAll.length > 0 && !collapsed[root.id],
    descendants: descendants.get(root.id) ?? 0,
    branch: -1,
    position: 1,
    siblings: 1,
  });

  /** Places a node in a band starting at `top`, with its inner edge at `edge`. */
  const place = (node: MindmapNode, depth: number, side: Side, edge: number, top: number, branch: number, position: number, siblings: number) => {
    const size = sizeOf(node, depth);
    const band = heights.get(node.id) ?? size.h;
    const all = children.get(node.id) ?? [];
    const x = side === "right" ? edge : edge - size.w;
    out.set(node.id, {
      node,
      depth,
      x,
      y: top + (band - size.h) / 2,
      w: size.w,
      h: size.h,
      lines: size.lines,
      side,
      hasChildren: all.length > 0,
      expanded: all.length > 0 && !collapsed[node.id],
      descendants: descendants.get(node.id) ?? 0,
      branch,
      position,
      siblings,
    });
    const kids = shown(node);
    const kidsHeight = kids.reduce((sum, kid, i) => sum + heights.get(kid.id)! + (i ? gapY(depth + 1) : 0), 0);
    let y = top + (band - kidsHeight) / 2;
    const next = side === "right" ? x + size.w + gapX(depth) : x - gapX(depth);
    kids.forEach((kid, i) => {
      place(kid, depth + 1, side, next, y, branch, i + 1, kids.length);
      y += heights.get(kid.id)! + gapY(depth + 1);
    });
  };

  const placeSide = (list: MindmapNode[], side: Side) => {
    const total = list.reduce((sum, kid, i) => sum + heights.get(kid.id)! + (i ? gapY(1) : 0), 0);
    let y = -total / 2;
    const edge = side === "right" ? rootSize.w / 2 + gapX(0) : -rootSize.w / 2 - gapX(0);
    list.forEach((kid) => {
      const index = rootShown.indexOf(kid);
      place(kid, 1, side, edge, y, index, index + 1, rootShown.length);
      y += heights.get(kid.id)! + gapY(1);
    });
  };
  placeSide(right, "right");
  placeSide(left, "left");

  // Reading order: the root, then each branch depth first, in the spec's order.
  const ordered: PlacedNode[] = [];
  const walk = (node: MindmapNode) => {
    const p = out.get(node.id);
    if (!p) return;
    ordered.push(p);
    shown(node).forEach(walk);
  };
  walk(root);

  const minX = Math.min(...ordered.map((p) => p.x));
  const minY = Math.min(...ordered.map((p) => p.y));
  for (const p of ordered) {
    p.x = Math.round(p.x - minX);
    p.y = Math.round(p.y - minY);
  }
  return {
    nodes: ordered,
    width: Math.max(...ordered.map((p) => p.x + p.w)),
    height: Math.max(...ordered.map((p) => p.y + p.h)),
  };
}

/** Where an edge leaves a parent and enters a child, so lines meet the boxes cleanly. */
export function edgeEnds(parent: { x: number; y: number; w: number; h: number; depth: number }, child: { x: number; y: number; w: number; h: number; depth: number; side: Side }) {
  const right = child.side === "right";
  const start =
    parent.depth === 0
      ? { x: parent.x + parent.w / 2, y: parent.y + parent.h / 2 }
      : parent.depth === 1
        ? { x: right ? parent.x + parent.w : parent.x, y: parent.y + parent.h / 2 }
        : { x: right ? parent.x + parent.w : parent.x, y: parent.y + parent.h - 1 };
  const end = child.depth === 1 ? { x: right ? child.x : child.x + child.w, y: child.y + child.h / 2 } : { x: right ? child.x : child.x + child.w, y: child.y + child.h - 1 };
  return { start, end };
}

/** A smooth curve between two points that leaves and arrives horizontally. */
export function edgePath(start: { x: number; y: number }, end: { x: number; y: number }): string {
  const dx = (end.x - start.x) * 0.5;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M ${r(start.x)} ${r(start.y)} C ${r(start.x + dx)} ${r(start.y)}, ${r(end.x - dx)} ${r(end.y)}, ${r(end.x)} ${r(end.y)}`;
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

/** The overview: the central topic and its main branches, everything below them closed. */
export function collapseAll(nodes: readonly MindmapNode[]): Record<string, boolean> {
  const parents = new Set(nodes.map((n) => n.parent));
  return Object.fromEntries(nodes.filter((n) => n.parent !== undefined && parents.has(n.id)).map((n) => [n.id, true]));
}
