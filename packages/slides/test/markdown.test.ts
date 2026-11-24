import { describe, expect, it } from "vitest";
import { blockText, canvasSlideRefs, deckFromSlides, deckProblems, heading, paragraph, slideTitle, splitSlideMarkdown, type NoteBlock } from "../src/index.js";

describe("slide markdown", () => {
  it("splits at --- and takes notes after ???, never inside code fences", () => {
    const md = [
      "# Attention",
      "How a transformer looks",
      "???",
      "Welcome everyone.",
      "---",
      "## Code",
      "```yaml",
      "a: 1",
      "---",
      "b: 2",
      "```",
      "---",
      "",
      "---",
      "## Last",
    ].join("\n");
    expect(splitSlideMarkdown(md)).toEqual([
      { markdown: "# Attention\nHow a transformer looks", notes: "Welcome everyone." },
      { markdown: "## Code\n```yaml\na: 1\n---\nb: 2\n```", notes: "" },
      { markdown: "## Last", notes: "" },
    ]);
  });

  it("picks each slide's layout from what it holds", () => {
    const quiz: NoteBlock = { id: "q", type: "interactive", props: { kind: "quiz" }, children: [] };
    const bullet = { ...paragraph("a point"), type: "bulletListItem" };
    const deck = deckFromSlides([
      { blocks: [heading("Attention", 1), paragraph("subtitle")], notes: "hi" },
      { blocks: [heading("Part 1", 1)], notes: "" },
      { blocks: [heading("Check", 2), paragraph("Answer first."), quiz], notes: "" },
      { blocks: [heading("Video", 2), quiz], notes: "" },
      { blocks: [heading("Points", 2), bullet, bullet], notes: "" },
    ]);
    expect(deck.slides.map((s) => [s.layout, slideTitle(s), s.side.length])).toEqual([
      ["title", "Attention", 0],
      ["section", "Part 1", 0],
      ["split", "Check", 1],
      ["media", "Video", 0],
      ["content", "Points", 0],
    ]);
    expect(deck.slides[0]!.notes).toBe("hi");
    expect(blockText(deck.slides[2]!.main[1]!)).toBe("Answer first.");
    expect(deckProblems(deck)).toEqual([]);
  });
});

describe("canvas slides without the canvas library", () => {
  const frame = (id: string, x: number, y: number, extra = {}) => ({ id, type: "frame", x, y, w: 100, h: 80, title: id.toUpperCase(), ...extra });
  it("reads frames and figures in rows, figures inside frames belong to the frame", () => {
    const doc = {
      items: [
        frame("b", 200, 0),
        frame("a", 0, 10),
        { id: "inside", type: "figure", x: 210, y: 10, w: 20, h: 20, source: "title Hidden" },
        { id: "fig", type: "figure", x: 0, y: 300, w: 50, h: 50, source: "flowchart\ntitle Encoder" },
        { id: "shape", type: "shape", x: 0, y: 0, w: 5, h: 5 },
      ],
    };
    expect(canvasSlideRefs(doc)).toEqual([
      { itemId: "a", title: "A" },
      { itemId: "b", title: "B" },
      { itemId: "fig", title: "Encoder" },
    ]);
  });

  it("follows the canvas's own order and skips its hidden slides", () => {
    const doc = { items: [frame("a", 0, 0), frame("b", 200, 0), frame("c", 400, 0)], presentation: { order: ["c", "gone"], hidden: ["b"] } };
    expect(canvasSlideRefs(doc).map((s) => s.itemId)).toEqual(["c", "a"]);
  });

  it("a canvas with neither is one whole-canvas slide; an empty one has none", () => {
    expect(canvasSlideRefs({ items: [{ id: "s", type: "shape", x: 0, y: 0, w: 1, h: 1 }] })).toEqual([{ itemId: null, title: "" }]);
    expect(canvasSlideRefs({ items: [] })).toEqual([]);
    expect(canvasSlideRefs(null)).toEqual([]);
  });
});
