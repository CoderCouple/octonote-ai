import { describe, expect, it } from "vitest";
import { mermaidToCanvasDocument } from "../server";
import { isClassDiagram, parseMermaidClassDiagram } from "./mermaid-class";
import { MermaidParseError } from "./mermaid-flowchart";
import { parseLinkLine } from "./mermaid-links";

const SRC = `classDiagram
  direction LR
  class BenchmarkAdapter {
    <<interface>>
    +spec() BenchSpec
    +launch(task) RunView
  }
  class Ledger
  Ledger : +expected_rollouts(k) int
  class Box~T~
  BenchmarkAdapter <|.. JobBench : implements
  Ledger "1" *-- "many" Entry
  Scheduler o-- Ledger
  Scheduler --> BenchmarkAdapter
  Scheduler ..> Box
  namespace substrate {
    class Codex
  }
  click Ledger href "https://github.com/google-research/harness2/blob/main/harness2/core/ledger.py#L20" "Ledger"
  link Codex "https://github.com/google-research/harness2/blob/main/harness2/substrate/codex.py"
  click Scheduler href "javascript:alert(1)"`;

describe("parseMermaidClassDiagram", () => {
  const chart = parseMermaidClassDiagram(SRC);
  const byId = Object.fromEntries(chart.nodes.map((n) => [n.id, n]));

  it("knows a class diagram from a flowchart", () => {
    expect(isClassDiagram(SRC)).toBe(true);
    expect(isClassDiagram("%% hi\nclassDiagram-v2\n A")).toBe(true);
    expect(isClassDiagram("flowchart LR\n A --> B")).toBe(false);
  });

  it("draws each class with its stereotype, name and members", () => {
    expect(chart.direction).toBe("LR");
    expect(byId.BenchmarkAdapter!.label).toBe(
      "«interface»\nBenchmarkAdapter\n───────\n+spec() BenchSpec\n+launch(task) RunView",
    );
    expect(byId.Ledger!.label).toBe("Ledger\n───────\n+expected_rollouts(k) int");
    expect(byId.Box!.label).toBe("Box<T>");
    expect(byId.Codex!.group).toBe("substrate");
    expect(chart.groups).toEqual([{ id: "substrate", title: "substrate", parent: null }]);
  });

  it("maps UML relations to arrowheads, with labels and cardinalities", () => {
    const edge = (from: string, to: string) => chart.edges.find((e) => e.from === from && e.to === to)!;
    expect(edge("BenchmarkAdapter", "JobBench")).toMatchObject({ startHead: "triangle", dashed: true, label: "implements" });
    expect(edge("Ledger", "Entry")).toMatchObject({ startHead: "diamond", label: "(1 → many)" });
    expect(edge("Scheduler", "Ledger")).toMatchObject({ startHead: "diamond", dashed: false });
    expect(edge("Scheduler", "BenchmarkAdapter")).toMatchObject({ endHead: "arrow", end: true });
    expect(edge("Scheduler", "Box")).toMatchObject({ endHead: "arrow", dashed: true });
  });

  it("links boxes to http(s) URLs only", () => {
    expect(byId.Ledger!.url).toContain("ledger.py#L20");
    expect(byId.Codex!.url).toContain("codex.py");
    expect(byId.Scheduler!.url).toBeUndefined();
    expect(parseLinkLine('click A call go()')).toBeNull();
  });

  it("explains what it can't read", () => {
    expect(() => parseMermaidClassDiagram("classDiagram\n  A <=> B")).toThrow(MermaidParseError);
    expect(() => parseMermaidClassDiagram("classDiagram\n  class A {\n  +x")).toThrow(/missing its/);
  });

  it("becomes a valid canvas with linked, top-left class boxes and UML heads", () => {
    const recs = Object.values(
      (mermaidToCanvasDocument(SRC) as unknown as { store: Record<string, Record<string, any>> }).store,
    );
    const ledger = recs.find((r) => r.id === "shape:node-Ledger")!;
    expect(ledger.props).toMatchObject({ align: "start", verticalAlign: "start", url: expect.stringContaining("ledger.py") });
    const heads = recs.filter((r) => r.type === "arrow").map((a) => a.props.arrowheadStart);
    expect(heads).toContain("triangle");
    expect(heads).toContain("diamond");
  });
});

describe("flowchart click links", () => {
  it("puts the link on the box", () => {
    const recs = Object.values(
      (mermaidToCanvasDocument(
        'flowchart LR\n  A[Ledger] --> B\n  click A href "https://example.com/ledger.py#L3" "open"\n  click B call cb()',
      ) as unknown as { store: Record<string, Record<string, any>> }).store,
    );
    expect(recs.find((r) => r.id === "shape:node-A")!.props.url).toBe("https://example.com/ledger.py#L3");
    expect(recs.find((r) => r.id === "shape:node-B")!.props.url).toBe("");
  });
});
