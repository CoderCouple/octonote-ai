import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mermaidToCanvasDocument } from "../server";

type Rec = Record<string, any>;
const records = (snap: { store: Record<string, Rec> }) => Object.values(snap.store);

describe("mermaid flowchart → canvas", () => {
  const snap = mermaidToCanvasDocument(`flowchart LR
    subgraph app [App servers]
      A[API] --> C{Cache hit?}
    end
    U((User)) --> A
    C -->|yes| R[(Redis)]
    C -- no --> D[(Postgres)]
    D -.-> Q([Queue])`) as unknown as { store: Record<string, Rec>; schema: unknown };

  it("makes one shape per node, a group behind them, and bound arrows", () => {
    const all = records(snap);
    const shapes = all.filter((r) => r.typeName === "shape");
    const geos = shapes.filter((s) => s.type === "geo");
    const arrows = shapes.filter((s) => s.type === "arrow");
    const bindings = all.filter((r) => r.typeName === "binding");
    expect(geos).toHaveLength(7); // 6 nodes + 1 group
    expect(arrows).toHaveLength(5);
    expect(bindings).toHaveLength(10);
    const group = geos.find((g) => g.props.dash === "dashed")!;
    const others = geos.filter((g) => g !== group);
    expect(others.every((g) => g.index > group.index)).toBe(true);
    expect(geos.find((g) => g.id === "shape:node-C")!.props.geo).toBe("diamond");
    expect(geos.find((g) => g.id === "shape:node-U")!.props.geo).toBe("ellipse");
    expect(arrows.find((a) => a.props.dash === "dashed")).toBeTruthy();
  });

  it("makes a box taller when its label wraps, so the text stays inside", () => {
    const geo = (src: string) =>
      records(mermaidToCanvasDocument(src) as unknown as { store: Record<string, Rec> }).find(
        (r) => r.id === "shape:node-A",
      )!;
    const short = geo("flowchart TD\n  A[API]");
    const long = geo(
      "flowchart TD\n  A[Services - notes, canvases, projects, notebooks, shares, public, votes, analytics, billing]",
    );
    expect(long.props.w).toBe(320);
    expect(long.props.h).toBeGreaterThanOrEqual(short.props.h + 2 * 22);
  });

  it("lays out left to right without overlapping boxes", () => {
    const nodes = records(snap).filter((r) => r.type === "geo" && r.props.dash !== "dashed");
    const x = (id: string) => nodes.find((n) => n.id === `shape:node-${id}`)!.x;
    expect(x("U")).toBeLessThan(x("A"));
    expect(x("A")).toBeLessThan(x("C"));
    for (const a of nodes)
      for (const b of nodes) {
        if (a === b) continue;
        const overlap =
          a.x < b.x + b.props.w && b.x < a.x + a.props.w && a.y < b.y + b.props.h && b.y < a.y + a.props.h;
        expect(overlap).toBe(false);
      }
  });

  it("uses the same tldraw version as the web app (else canvases may not open)", () => {
    const pkg = (dir: string) => JSON.parse(readFileSync(join(realpathSync(dir), "package.json"), "utf8"));
    const here = pkg(join(__dirname, "../../node_modules/@tldraw/tlschema")).version;
    const web = pkg(join(__dirname, "../../../../apps/web/node_modules/tldraw")).version;
    expect(here).toBe(web);
  });
});
