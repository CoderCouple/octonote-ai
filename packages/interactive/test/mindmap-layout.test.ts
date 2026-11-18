import { describe, expect, it } from "vitest";
import { collapseAll, layoutMindmap, mindmapSvg, NODE_STYLES, wrapText, type PlacedNode } from "../src/index.js";

const node = (id: string, label: string, parent?: string) => ({ id, label, ...(parent ? { parent } : {}) });

/** A root with `branches` children, each with `leaves` children. */
function tree(branches: number, leaves: number, label = (b: number, l: number) => `Topic ${b}.${l}`) {
  const nodes = [node("r", "Root")];
  for (let b = 0; b < branches; b++) {
    nodes.push(node(`b${b}`, `Branch ${b}`, "r"));
    for (let l = 0; l < leaves; l++) nodes.push(node(`b${b}l${l}`, label(b, l), `b${b}`));
  }
  return nodes;
}

const overlaps = (a: PlacedNode, b: PlacedNode) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("mind map layout", () => {
  it("never overlaps two topics, on either side", () => {
    const layout = layoutMindmap(
      tree(7, 5, (b, l) => (l % 2 ? `A much longer topic label ${b}.${l} that has to wrap onto more lines` : `Short ${b}.${l}`)),
      {},
    );
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) expect(overlaps(layout.nodes[i]!, layout.nodes[j]!), `${layout.nodes[i]!.node.id} / ${layout.nodes[j]!.node.id}`).toBe(false);
  });

  it("splits the branches around the root, the first half down the right", () => {
    const layout = layoutMindmap(tree(6, 2), {});
    const root = layout.nodes[0]!;
    const sides = layout.nodes.filter((p) => p.depth === 1).map((p) => p.side);
    expect(sides).toEqual(["right", "right", "right", "left", "left", "left"]);
    for (const p of layout.nodes.slice(1)) {
      if (p.side === "right") expect(p.x).toBeGreaterThan(root.x + root.w);
      else expect(p.x + p.w).toBeLessThan(root.x);
    }
    // Children follow their branch's side.
    expect(layout.nodes.filter((p) => p.depth === 2).every((p) => p.side === layout.nodes.find((q) => q.node.id === p.node.parent)!.side)).toBe(true);
  });

  it("grows to the right only when asked, and for maps with one or two branches", () => {
    expect(layoutMindmap(tree(6, 1), {}, { direction: "right" }).nodes.every((p) => p.side === "right")).toBe(true);
    expect(layoutMindmap(tree(2, 3), {}).nodes.every((p) => p.side === "right")).toBe(true);
  });

  it("uses whole pixels from 0,0 and the same numbers every time (no hydration drift)", () => {
    const nodes = tree(5, 3);
    const a = layoutMindmap(nodes, {});
    expect(a.nodes.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.w) && Number.isInteger(p.h))).toBe(true);
    expect(Math.min(...a.nodes.map((p) => p.x))).toBe(0);
    expect(Math.min(...a.nodes.map((p) => p.y))).toBe(0);
    expect(JSON.stringify(layoutMindmap(nodes, {}))).toBe(JSON.stringify(a));
  });

  it("leaves collapsed branches out but counts what they hide", () => {
    const layout = layoutMindmap(tree(3, 4), { b1: true });
    expect(layout.nodes.some((p) => p.node.parent === "b1")).toBe(false);
    const b1 = layout.nodes.find((p) => p.node.id === "b1")!;
    expect(b1).toMatchObject({ hasChildren: true, expanded: false, descendants: 4 });
  });

  it("sizes nodes to their (renamed) labels", () => {
    const nodes = tree(3, 1);
    const plain = layoutMindmap(nodes, {}).nodes.find((p) => p.node.id === "b0")!;
    const renamed = layoutMindmap(nodes, {}, { labels: { b0: "A far longer name for this branch" } }).nodes.find((p) => p.node.id === "b0")!;
    expect(renamed.w).toBeGreaterThan(plain.w);
    expect(renamed.lines.join(" ")).toBe("A far longer name for this branch");
  });

  it("collapse all leaves the root's branches showing", () => {
    const nodes = tree(3, 2);
    expect(layoutMindmap(nodes, collapseAll(nodes)).nodes).toHaveLength(4);
  });
});

describe("wrapping labels", () => {
  const style = NODE_STYLES[2];

  it("wraps on spaces within the width", () => {
    const lines = wrapText("Divide by the square root of the key dimension to keep gradients stable", style);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Divide by the square root of the key dimension to keep gradients stable");
  });

  it("breaks a word too long for a line, and ends with an ellipsis past the last line", () => {
    expect(wrapText("Supercalifragilisticexpialidociousnessxxxxxxxxxxxxxxxxxx", style).length).toBeGreaterThan(1);
    const long = wrapText("word ".repeat(200), style);
    expect(long).toHaveLength(style.maxLines);
    expect(long[long.length - 1]!.endsWith("…")).toBe(true);
  });
});

describe("export", () => {
  it("draws every topic, escapes labels and sizes the picture to the map", () => {
    const nodes = [...tree(3, 1), node("x", "Fish & <chips>", "b0")];
    const layout = layoutMindmap(nodes, {});
    const positions = new Map(layout.nodes.map((p) => [p.node.id, { x: p.x, y: p.y }]));
    const colors = { background: "#fff", surface: "#fff", text: "#333", strong: "#000", rootBg: "#000", rootFg: "#fff", branches: Array(8).fill("#36f") };
    const { svg, width, height } = mindmapSvg(layout.nodes, positions, colors, "My map");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Fish &amp; &lt;chips&gt;");
    expect(svg).not.toContain("<chips>");
    expect(svg.match(/<path /g)).toHaveLength(layout.nodes.length - 1);
    expect(width).toBeGreaterThanOrEqual(layout.width);
    expect(height).toBeGreaterThanOrEqual(layout.height);
  });
});
