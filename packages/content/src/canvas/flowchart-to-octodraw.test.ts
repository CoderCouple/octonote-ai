import { describe, expect, it } from "vitest";
import { mermaidToOctodraw, MermaidParseError } from "../index";
import type { CanvasItem, LineItem, ShapeItem, TextItem } from "./octodraw-types";
import { isCanvasDocument, resolveLines } from "../../../octodraw/src/canvas/model";

const byId = (items: CanvasItem[], id: string) => items.find((i) => i.id === id);

describe("mermaid → octodraw", () => {
  const doc = mermaidToOctodraw(`flowchart LR
    subgraph app [App servers]
      A[API] --> C{Cache hit?}
    end
    U((User)) --> A
    C -->|yes| R[(Redis)]
    C -- no --> D[(Postgres)]
    D -.-> Q([Queue])`);
  const shapes = doc.items.filter((i) => i.type === "shape") as ShapeItem[];
  const lines = doc.items.filter((i) => i.type === "line") as LineItem[];

  it("makes one shape per node, a titled container behind them, and attached lines", () => {
    expect(isCanvasDocument(doc)).toBe(true);
    expect(shapes).toHaveLength(7); // 6 nodes + the container
    expect(lines).toHaveLength(5);
    expect(doc.items[0]).toMatchObject({ id: "group-app", type: "shape", color: "gray" });
    expect(byId(doc.items, "group-app-title")).toMatchObject({ type: "text", text: "App servers", bold: true });
    expect(byId(doc.items, "node-C")).toMatchObject({ shape: "diamond", text: "Cache hit?" });
    expect(byId(doc.items, "node-U")).toMatchObject({ shape: "ellipse" });
    expect(byId(doc.items, "node-R")).toMatchObject({ color: "blue" });
    const yes = lines.find((l) => l.text === "yes")!;
    expect(yes).toMatchObject({ start: { item: "node-C" }, end: { item: "node-R" }, endArrow: true });
    expect(lines.find((l) => l.dashed)).toMatchObject({ start: { item: "node-D" }, end: { item: "node-Q" } });
    expect(lines.every((l) => l.start.item && l.end.item)).toBe(true);
  });

  it("lays out left to right without overlapping boxes, the container around its nodes", () => {
    const nodes = shapes.filter((s) => s.id.startsWith("node-"));
    const x = (id: string) => byId(doc.items, `node-${id}`)!.x;
    expect(x("U")).toBeLessThan(x("A"));
    expect(x("A")).toBeLessThan(x("C"));
    for (const a of nodes)
      for (const b of nodes) {
        if (a === b) continue;
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    const g = byId(doc.items, "group-app")!;
    for (const id of ["node-A", "node-C"]) {
      const n = byId(doc.items, id)!;
      expect(n.x).toBeGreaterThanOrEqual(g.x);
      expect(n.x + n.w).toBeLessThanOrEqual(g.x + g.w);
      expect(n.y).toBeGreaterThanOrEqual(g.y);
    }
  });

  it("settles line ends where octodraw's editor would", () => {
    const resolved = resolveLines(doc as never).items as LineItem[];
    for (const line of resolved.filter((i) => i.type === "line")) {
      const ours = byId(doc.items, line.id) as LineItem;
      for (const k of ["x", "y", "w", "h"] as const) expect(ours[k]).toBeCloseTo(line[k], 6);
    }
  });

  it("makes a box taller when its label wraps", () => {
    const box = (src: string) => byId(mermaidToOctodraw(src).items, "node-A")!;
    const short = box("flowchart TD\n  A[API]");
    const long = box("flowchart TD\n  A[Services - notes, canvases, projects, notebooks, shares, public, votes, analytics, billing]");
    expect(long.w).toBe(320);
    expect(long.h).toBeGreaterThanOrEqual(short.h + 2 * 22);
  });

  it("puts a node first declared outside into the subgraph that mentions it", () => {
    const items = mermaidToOctodraw(`flowchart LR
      subgraph S [Task]
        A[One] --> B[Two]
      end
      B --> C[Three]
      subgraph H [Later]
        C --> A
      end`).items;
    const [h, c] = [byId(items, "group-H")!, byId(items, "node-C")!];
    expect(c.x).toBeGreaterThanOrEqual(h.x);
    expect(c.x + c.w).toBeLessThanOrEqual(h.x + h.w);
  });

  it("skips a subgraph left empty, and attaches an edge to a subgraph's container", () => {
    const empty = mermaidToOctodraw("flowchart LR\n  A[One] --> B[Two]\n  subgraph H [Nothing new]\n  end").items;
    expect(byId(empty, "group-H")).toBeUndefined();
    expect(empty.filter((i) => i.type === "shape")).toHaveLength(2);
    const toGroup = mermaidToOctodraw("flowchart LR\n  subgraph S [Task]\n    A[One] --> B[Two]\n  end\n  X[Out] --> S").items;
    expect((toGroup.filter((i) => i.type === "line") as LineItem[]).some((l) => l.end.item === "group-S")).toBe(true);
    expect(toGroup.every((i) => Number.isFinite(i.x) && Number.isFinite(i.y))).toBe(true);
  });

  it("is deterministic and rejects other diagram types", () => {
    const src = "flowchart TD\n  A --> B";
    expect(mermaidToOctodraw(src)).toEqual(mermaidToOctodraw(src));
    expect(() => mermaidToOctodraw("sequenceDiagram\n  A->>B: hi")).toThrow(MermaidParseError);
    const nested = mermaidToOctodraw("flowchart TD\n  subgraph O [Outer]\n    subgraph I [Inner]\n      A --> B\n    end\n  end").items;
    const order = nested.map((i) => i.id);
    expect(order.indexOf("group-O")).toBeLessThan(order.indexOf("group-I"));
    expect(order.indexOf("group-I")).toBeLessThan(order.indexOf("node-A"));
    expect((byId(nested, "group-I-title") as TextItem).text).toBe("Inner");
  });
});
