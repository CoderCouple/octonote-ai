import { describe, expect, it } from "vitest";
import { MermaidParseError, parseMermaidFlowchart } from "./mermaid-flowchart";

describe("parseMermaidFlowchart", () => {
  it("reads nodes, shapes, labels and the direction", () => {
    const f = parseMermaidFlowchart(`flowchart LR
      A[Browser] --> B(Load balancer)
      B --> C{Cache hit?}
      C -->|yes| D[(Redis)]
      C -- no --> E[(Postgres)]
      E -.-> F((Analytics))
      A ==> G([Done])`);
    expect(f.direction).toBe("LR");
    const byId = Object.fromEntries(f.nodes.map((n) => [n.id, n]));
    expect(byId.A).toMatchObject({ label: "Browser", shape: "rectangle" });
    expect(byId.B!.shape).toBe("round");
    expect(byId.C!.shape).toBe("diamond");
    expect(byId.D!.shape).toBe("database");
    expect(byId.F!.shape).toBe("circle");
    expect(byId.G!.shape).toBe("stadium");
    expect(f.edges).toEqual([
      { from: "A", to: "B", label: "", dashed: false, thick: false, start: false, end: true },
      { from: "B", to: "C", label: "", dashed: false, thick: false, start: false, end: true },
      { from: "C", to: "D", label: "yes", dashed: false, thick: false, start: false, end: true },
      { from: "C", to: "E", label: "no", dashed: false, thick: false, start: false, end: true },
      { from: "E", to: "F", label: "", dashed: true, thick: false, start: false, end: true },
      { from: "A", to: "G", label: "", dashed: false, thick: true, start: false, end: true },
    ]);
  });

  it("handles chains, open links, both-way arrows and &", () => {
    const f = parseMermaidFlowchart(`graph TD
      A --- B --> C
      X & Y --> Z
      P <--> Q`);
    expect(f.edges.map((e) => `${e.from}${e.end ? ">" : "-"}${e.to}`)).toEqual([
      "A-B",
      "B>C",
      "X>Z",
      "Y>Z",
      "P>Q",
    ]);
    expect(f.edges.at(-1)!.start).toBe(true);
  });

  it("keeps subgraphs as groups and ignores styling and comments", () => {
    const f = parseMermaidFlowchart(`graph TD
      %% services
      subgraph svc [Services]
        api[API] --> db[(DB)]
      end
      classDef hot fill:#f00
      style api fill:#f9f
      user --> api; user --> web`);
    expect(f.groups).toEqual([{ id: "svc", title: "Services", parent: null }]);
    expect(f.nodes.find((n) => n.id === "api")!.group).toBe("svc");
    expect(f.nodes.find((n) => n.id === "user")!.group).toBeNull();
    expect(f.edges).toHaveLength(3);
  });

  it("rejects other diagram types and broken input with a line number", () => {
    expect(() => parseMermaidFlowchart("sequenceDiagram\n A->>B: hi")).toThrow(/stay as mermaid blocks/);
    expect(() => parseMermaidFlowchart("graph TD\n A[open")).toThrow(MermaidParseError);
    expect(() => parseMermaidFlowchart("graph TD\n A -->")).toThrow(/Line 2/);
    expect(() => parseMermaidFlowchart("graph TD\nsubgraph x\n A")).toThrow(/missing its "end"/);
  });
});

describe("arrows written without spaces", () => {
  it.each([
    ["A-->B", false, null],
    ["A-.->B", true, null],
    ["A---B", false, null],
    ["A-->|yes|B", false, "yes"],
    ["web-01-->db-main", false, null],
  ])("parses %s", (line, dashed, label) => {
    const chart = parseMermaidFlowchart(`graph TD\n  ${line}`);
    expect(chart.edges).toHaveLength(1);
    const [from, to] = line.includes("web") ? ["web-01", "db-main"] : ["A", "B"];
    expect(chart.edges[0]).toMatchObject({ from, to });
    if (label) expect(chart.edges[0]!.label).toBe(label);
    if (dashed) expect(JSON.stringify(chart.edges[0])).toMatch(/dot|dash/);
  });
});
