import { describe, expect, it } from "vitest";
import { canvasOutline, figureLines, renderCanvas, renderNotebook, renderProject } from "./terminal-items.js";

const FIGURE = `title Checkout
direction down

Clients [color: blue, icon: users] {
  Web app [shape: rectangle, label: "Web", description: "Next.js storefront"]
}
Shopper [icon: user] > API [icon: shield]: POST /checkout
API --> Shopper: 202
Shopper, API > Web app`;

const DOC = {
  version: 1,
  items: [
    { id: "s2", type: "shape", x: 0, y: 200, text: "Second" },
    { id: "s1", type: "shape", x: 0, y: 0, text: "First" },
    { id: "l1", type: "line", start: { item: "s1" }, end: { item: "s2" }, text: "then" },
    { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    { id: "f1", type: "figure", x: 0, y: 500, source: FIGURE },
    { id: "p1", type: "pen", x: 0, y: 900, points: [] },
  ],
};

describe("canvas outline", () => {
  it("lists figures, words top to bottom, and labelled connections", () => {
    const o = canvasOutline(DOC);
    expect(o.counts).toEqual({ shape: 2, line: 2, figure: 1, pen: 1 });
    expect(o.figures.map((f) => f.title)).toEqual(["Checkout"]);
    expect(o.blocks.map((b) => b.text)).toEqual(["First", "Second"]);
    expect(o.connections).toEqual([{ from: "First", to: "Second", label: "then" }]);
  });

  it("drops figure styling and keeps structure", () => {
    expect(figureLines(FIGURE, false)).toEqual([
      "Clients",
      "  Web — Next.js storefront",
      "Shopper → API: POST /checkout",
      "API → Shopper: 202",
      "Shopper, API → Web",
    ]);
  });

  it("copes with empty or odd documents", () => {
    expect(canvasOutline(null).figures).toEqual([]);
    expect(renderCanvas("Empty", { version: 1, items: [] }, false)).toContain("Nothing on this canvas yet.");
  });

  it("names a box by its first line and describes it with the rest", () => {
    const o = canvasOutline({
      items: [
        { id: "a", type: "shape", y: 0, text: "NestJS API\nFastify · Railway" },
        { id: "b", type: "shape", y: 1, text: "Postgres" },
        { id: "l", type: "line", start: { item: "a" }, end: { item: "b" } },
      ],
    });
    expect(o.blocks[0]!.text).toBe("NestJS API — Fastify · Railway");
    expect(o.connections[0]).toEqual({ from: "NestJS API", to: "Postgres" });
  });

  it("removes escape codes from item text", () => {
    const doc = { items: [{ id: "a", type: "text", text: "hi\u001b]8;;http://x\u001b\\" }] };
    expect(canvasOutline(doc).blocks[0]!.text).not.toContain("\u001b");
  });

  it("prints the title, counts and sections", () => {
    const out = renderCanvas("Board", DOC, false, 60).split("\n");
    expect(out[0]).toMatch(/^╭─ Board ─+╮$/);
    expect(out[1]).toContain("2 shapes · 2 lines · 1 figure · 1 drawing");
    expect(out.some((l) => l.includes("• First →"))).toBe(true);
    expect(out[out.length - 1]).toMatch(/^╰─+╯$/);
    for (const l of out) expect(l.length).toBe(60);
  });
});

describe("project and notebook", () => {
  it("sets the note and canvas side by side in one box, with a divider", () => {
    const out = renderProject("Plan", "# Plan\n\nBody " + "word ".repeat(60), DOC, false, 100).split("\n");
    expect(out[0]).toMatch(/^╭─ Plan ─+┬─+╮$/);
    expect(out[1]).toMatch(/^│ Note +│ Canvas +│$/);
    expect(out[2]).toMatch(/^├─+┼─+┤$/);
    expect(out[out.length - 1]).toMatch(/^╰─+┴─+╯$/);
    const divider = out[0]!.indexOf("┬");
    for (const l of out) {
      expect(l.length).toBe(100);
      expect("┬│┼┴").toContain(l[divider]!);
    }
    expect(out.join("\n").match(/Plan/g)).toHaveLength(1);
  });

  it("stacks the panes in a narrow window", () => {
    const out = renderProject("Plan", "Body", DOC, false, 60).split("\n");
    expect(out[0]).toMatch(/^╭─ Plan ─+╮$/);
    expect(out.some((l) => /^├─+┤$/.test(l))).toBe(true);
    for (const l of out) expect(l.length).toBe(60);
  });

  it("says so when a project's note is empty", () => {
    expect(renderProject("Plan", "", DOC, false)).toContain("The note is empty.");
  });

  it("groups a notebook by kind, newest first, with links", () => {
    const out = renderNotebook(
      "Book",
      [
        { kind: "note", title: "Old | one", url: "https://x.ai/n/1", updatedAt: "2026-01-01T00:00:00Z", published: false },
        { kind: "note", title: "New", url: "https://x.ai/n/2", updatedAt: "2026-02-01T00:00:00Z", published: true },
        { kind: "project", title: "P", url: "https://x.ai/p/3", published: false },
      ],
      false,
    );
    expect(out).toContain("Notes (2)");
    expect(out).toContain("Projects (1)");
    expect(out).not.toContain("Canvases");
    expect(out.indexOf("New")).toBeLessThan(out.indexOf("Old | one"));
    expect(out).toContain("https://x.ai/n/2");
  });

  it("says so when a notebook is empty", () => {
    expect(renderNotebook("Book", [], false)).toContain("This notebook is empty.");
  });
});
