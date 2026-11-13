import { describe, expect, it } from "vitest";
import { canvasToMermaid, mermaidLabel } from "../../../src/service/lib/canvas-mermaid";

const box = (id: string, text: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "shape",
  shape: "rectangle",
  text,
  x,
  y,
  w: 100,
  h: 60,
  ...extra,
});
const line = (id: string, from: string, to: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "line",
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  start: { x: 0, y: 0, item: from },
  end: { x: 0, y: 0, item: to },
  ...extra,
});

describe("canvasToMermaid", () => {
  it("turns two connected boxes into nodes and a labelled edge", () => {
    const doc = { version: 1, items: [box("b", "Second", 0, 200), box("a", "First", 0, 0), line("l", "a", "b", { endArrow: true, text: "then" })] };
    expect(canvasToMermaid(doc)).toBe(['flowchart TD', '  n1["First"]', '  n2["Second"]', '  n1 -->|"then"| n2'].join("\n"));
  });

  it("keeps shape kinds, arrowheads and dashes", () => {
    const doc = {
      items: [
        box("a", "Start", 0, 0, { shape: "ellipse" }),
        box("b", "Ok?", 0, 100, { shape: "diamond" }),
        box("c", "End", 0, 200),
        line("l1", "a", "b", { endHead: "arrow" }),
        line("l2", "b", "c", { startHead: "arrow", endHead: "none" }),
        line("l3", "a", "c", { strokeStyle: "dashed", endHead: "arrow" }),
        line("l4", "a", "c"),
        line("l5", "a", "c", { startHead: "arrow", endHead: "open" }),
      ],
    };
    expect(canvasToMermaid(doc)!.split("\n")).toEqual([
      "flowchart TD",
      '  n1(("Start"))',
      '  n2{"Ok?"}',
      '  n3["End"]',
      "  n1 --> n2",
      "  n3 --> n2",
      "  n1 -.-> n3",
      "  n1 --- n3",
      "  n1 <--> n3",
    ]);
  });

  it("includes unconnected text and sticky notes, drops empty unconnected boxes and loose lines", () => {
    const doc = {
      items: [
        { id: "t", type: "text", text: "A heading", x: 0, y: 0, w: 100, h: 20, fontSize: 20 },
        { id: "s", type: "sticky", text: "Remember", x: 200, y: 0, w: 100, h: 100 },
        box("e", "", 0, 300),
        { id: "p", type: "pen", points: [], x: 0, y: 0, w: 1, h: 1 },
        { id: "l", type: "line", start: { x: 0, y: 0, item: "t" }, end: { x: 5, y: 5 } },
      ],
    };
    expect(canvasToMermaid(doc)).toBe(['flowchart TD', '  n1["A heading"]', '  n2["Remember"]'].join("\n"));
  });

  it("keeps an empty box that a line connects", () => {
    const doc = { items: [box("a", "", 0, 0), box("b", "B", 0, 100), line("l", "a", "b", { endArrow: true })] };
    expect(canvasToMermaid(doc)).toContain('n1[""]');
    expect(canvasToMermaid(doc)).toContain("n1 --> n2");
  });

  it("groups nodes inside a titled frame into a subgraph", () => {
    const doc = {
      items: [
        { id: "f", type: "frame", title: "Backend", device: "desktop", x: -10, y: -10, w: 300, h: 300 },
        box("a", "API", 0, 0),
        box("b", "Outside", 500, 500),
      ],
    };
    expect(canvasToMermaid(doc)!.split("\n")).toEqual([
      "flowchart TD",
      '  n2["Outside"]',
      '  subgraph g1["Backend"]',
      '    n1["API"]',
      "  end",
    ]);
  });

  it("escapes labels so text can't break out of them", () => {
    expect(mermaidLabel('He said "hi" | <b> #1 `x`\nnext')).toBe("He said #quot;hi#quot; #124; #lt;b#gt; #35;1 #96;x#96;<br/>next");
    const out = canvasToMermaid({ items: [box("a", 'x"] --> evil["y', 0, 0)] })!;
    expect(out).toBe('flowchart TD\n  n1["x#quot;] --#gt; evil[#quot;y"]');
  });

  it("is null for an empty or malformed document", () => {
    expect(canvasToMermaid(null)).toBeNull();
    expect(canvasToMermaid({ items: "x" })).toBeNull();
    expect(canvasToMermaid({ version: 1, items: [] })).toBeNull();
    expect(canvasToMermaid({ items: [null, 3, { type: "shape" }] })).toBeNull();
  });
});
