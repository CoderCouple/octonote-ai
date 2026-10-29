import { describe, expect, it } from "vitest";
import { mermaidToOctodraw } from "../server";
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

  it("becomes an octodraw canvas with linked class boxes and attached relations", () => {
    const items = mermaidToOctodraw(SRC).items as Record<string, any>[];
    const ledger = items.find((r) => r.id === "node-Ledger")!;
    expect(ledger).toMatchObject({ type: "shape", shape: "rectangle", link: expect.stringContaining("ledger.py") });
    const lines = items.filter((r) => r.type === "line");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.start.item && l.end.item)).toBe(true);
    // UML heads (triangle, diamond) are drawn as octodraw arrows.
    expect(lines.some((l) => l.startArrow || l.endArrow)).toBe(true);
  });
});

describe("flowchart click links", () => {
  it("puts the link on the box", () => {
    const items = mermaidToOctodraw(
      'flowchart LR\n  A[Ledger] --> B\n  click A href "https://example.com/ledger.py#L3" "open"\n  click B call cb()',
    ).items as Record<string, any>[];
    expect(items.find((r) => r.id === "node-A")!.link).toBe("https://example.com/ledger.py#L3");
    expect(items.find((r) => r.id === "node-B")!.link).toBeUndefined();
  });
});
