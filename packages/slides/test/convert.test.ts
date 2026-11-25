import { describe, expect, it } from "vitest";
import {
  blockText, heading, paragraph, type NoteBlock } from "../src/index.js";
import { planFromNote, planFromNotebook, planFromProject } from "../src/convert.js";
import { legacyDeckProblems as deckProblems, type LegacySlide } from "../src/legacy.js";

/** A planned (fixed-layout) slide's title: its first heading. */
const slideTitle = (s: LegacySlide) => {
  const h = [...s.main, ...s.side].find((b) => b.type === "heading");
  return (h ? blockText(h) : "").trim();
};

const bullet = (text: string): NoteBlock => ({ ...paragraph(text), type: "bulletListItem" });
const quiz = (): NoteBlock => ({ id: crypto.randomUUID(), type: "interactive", props: { kind: "quiz", spec: "{}" }, children: [] });
const video = (): NoteBlock => ({ id: crypto.randomUUID(), type: "manimVideo", props: { videoId: "vid_1" }, children: [] });
const divider = (): NoteBlock => ({ id: crypto.randomUUID(), type: "divider", props: {}, children: [] });
const long = "Dot products grow with the dimension of the vectors, so before the softmax their spread is about the square root of d_k. ".repeat(3);

/** What a test reads from a slide: its layout, title, the block types on it and whether it has notes. */
const shape = (s: LegacySlide) => ({
  layout: s.layout,
  title: slideTitle(s),
  main: s.main.map((b) => b.type),
  side: s.side.map((b) => b.type),
  notes: s.notes.length > 0,
});

describe("note → deck", () => {
  const note = {
    title: "Scaled dot-product attention",
    blocks: [
      paragraph("How a transformer decides what to look at."),
      heading("Three views of the same input", 2),
      paragraph(long),
      bullet("Query: what I'm looking for"),
      bullet("Key: what I contain"),
      quiz(),
      heading("Why divide by √d_k", 2),
      paragraph("Short lead."),
      heading("A detail", 3),
      video(),
      video(),
      heading("Summary", 2),
      paragraph(""),
    ],
  };

  it("splits at headings: text left, the block right, paragraphs to notes", () => {
    const deck = planFromNote(note);
    expect(deck.slides.map(shape)).toEqual([
      { layout: "title", title: "Scaled dot-product attention", main: ["heading", "paragraph"], side: [], notes: false },
      { layout: "split", title: "Three views of the same input", main: ["heading", "bulletListItem", "bulletListItem"], side: ["interactive"], notes: true },
      // Its H3 stays on the slide as a point; the short lead moves to notes because the slide has blocks.
      { layout: "split", title: "Why divide by √d_k", main: ["heading", "heading"], side: ["manimVideo"], notes: true },
      { layout: "media", title: "Why divide by √d_k", main: ["heading", "manimVideo"], side: [], notes: false },
      { layout: "section", title: "Summary", main: ["heading"], side: [], notes: false },
    ]);
    expect(blockText(deck.slides[0]!.main[1]!)).toBe("How a transformer decides what to look at.");
    expect(deck.slides[1]!.notes).toBe(long.trim());
    // Continued slides share the heading's id, so the title morphs between them.
    expect(deck.slides[2]!.main[0]!.id).toBe(deck.slides[3]!.main[0]!.id);
    expect(deckProblems(deck)).toEqual([]);
  });

  it("keeps everything on the slide when asked, with a section's blocks together", () => {
    const deck = planFromNote(note, { split: "heading", textToNotes: false, onePerSlide: false });
    expect(deck.slides.map(shape)[2]).toEqual({ layout: "split", title: "Why divide by √d_k", main: ["heading", "paragraph", "heading"], side: ["manimVideo", "manimVideo"], notes: false });
  });

  it("a text-only slide keeps its short lead paragraph", () => {
    const deck = planFromNote({ title: "T", blocks: [heading("Idea", 2), paragraph("One line."), paragraph(long)] });
    expect(deck.slides[1]).toMatchObject({ layout: "content" });
    expect(deck.slides[1]!.main.map(blockText)).toEqual(["Idea", "One line."]);
    expect(deck.slides[1]!.notes).toBe(long.trim());
  });

  it("splits at dividers when asked, taking a section's first heading as its title", () => {
    const deck = planFromNote(
      { title: "T", blocks: [heading("One", 2), bullet("a"), divider(), heading("Two", 3), bullet("b"), heading("Still two", 2), bullet("c")] },
      { split: "divider", textToNotes: true, onePerSlide: true },
    );
    expect(deck.slides.map((s) => slideTitle(s))).toEqual(["T", "One", "Two"]);
    expect(deck.slides[2]!.main.map(blockText)).toEqual(["Two", "b", "Still two", "c"]);
  });

  it("continues long lists on another slide", () => {
    const deck = planFromNote({ title: "T", blocks: [heading("Many", 2), ...Array.from({ length: 10 }, (_, i) => bullet(`b${i}`))] });
    expect(deck.slides.slice(1).map((s) => s.main.length)).toEqual([8, 4]);
    expect(deck.slides.slice(1).map((s) => slideTitle(s))).toEqual(["Many", "Many"]);
  });
});

describe("project and notebook → deck", () => {
  const canvasDoc = { version: 1, items: [{ id: "frame-1", type: "frame" }] };
  const canvas = { title: "Diagram", canvasId: "cnv_1", slides: [{ itemId: "frame-1", title: "Encoder" }, { itemId: "fig-2", title: "Decoder" }], document: canvasDoc };

  it("a project's note slides, then one canvas slide per frame or figure", () => {
    const deck = planFromProject({ title: "Transformer", note: { title: "ignored", blocks: [heading("Idea", 2), bullet("x")] }, canvas });
    expect(deck.slides.map((s) => [s.layout, slideTitle(s), s.canvas?.itemId ?? null])).toEqual([
      ["title", "Transformer", null],
      ["content", "Idea", null],
      ["canvas", "Encoder", "frame-1"],
      ["canvas", "Decoder", "fig-2"],
    ]);
    // The deck carries its own copy of the canvas.
    expect(deck.canvases).toEqual({ cnv_1: canvasDoc });
    expect(deckProblems(deck)).toEqual([]);
  });

  it("a canvas with no frames or figures is one slide of the whole canvas", () => {
    const deck = planFromProject({ title: "P", note: null, canvas: { ...canvas, slides: [] } });
    expect(deck.slides.map((s) => [s.layout, s.canvas ?? null])).toEqual([
      ["title", null],
      ["canvas", { canvasId: "cnv_1", itemId: null }],
    ]);
  });

  it("a notebook is a title slide, then a section per item in order", () => {
    const deck = planFromNotebook({
      title: "Transformers",
      items: [
        { kind: "page", title: "Attention", blocks: [paragraph("intro"), heading("QKV", 2), bullet("q")] },
        { kind: "canvas", ...canvas },
        { kind: "project", title: "Training", note: { title: "", blocks: [] }, canvas: null },
      ],
    });
    expect(deck.slides.map((s) => [s.layout, slideTitle(s)])).toEqual([
      ["title", "Transformers"],
      ["section", "Attention"],
      // No title slide inside a section; the intro paragraph stays as its own slide.
      ["content", ""],
      ["content", "QKV"],
      ["section", "Diagram"],
      ["canvas", "Encoder"],
      ["canvas", "Decoder"],
      ["section", "Training"],
    ]);
    expect(deckProblems(deck)).toEqual([]);
  });
});
