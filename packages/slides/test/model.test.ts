import { describe, expect, it } from "vitest";
import {
  clampPosition,
  deckProblems,
  emptyDeck,
  heading,
  newSlide,
  nextPosition,
  paragraph,
  previousPosition,
  slideTitle,
  toDeckDocument,
  type DeckSlide,
} from "../src/index.js";

const withBuilds = (n: number): DeckSlide => {
  const blocks = Array.from({ length: n }, (_, i) => paragraph(`p${i}`));
  return newSlide("content", { main: blocks, builds: blocks.map((b) => ({ blockId: b.id, effect: "fade" as const })) });
};

describe("deck model", () => {
  it("a new deck opens on a title slide and is valid", () => {
    const deck = emptyDeck("Attention");
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.layout).toBe("title");
    expect(slideTitle(deck.slides[0]!)).toBe("Attention");
    expect(deckProblems(deck)).toEqual([]);
  });

  it("explains what's wrong with a bad deck", () => {
    expect(deckProblems(null)).toEqual(["A deck must be an object with a slides list."]);
    const s = newSlide();
    const problems = deckProblems({ version: 1, slides: [s, { ...s }, { id: "x", layout: "poster", main: [], side: "no", notes: 3 }, { id: "c", layout: "canvas", main: [], side: [], notes: "" }] });
    expect(problems).toEqual([
      `Slide 2 repeats the id ${s.id}.`,
      "Slide 3 has an unknown layout.",
      "Slide 3 side must be a list of blocks.",
      "Slide 3 notes must be text.",
      "Slide 4 is a canvas slide without a canvas.",
    ]);
  });

  it("repairs anything stored into a deck that loads", () => {
    const p = paragraph("kept");
    const deck = toDeckDocument({
      theme: "neon",
      transition: "morph",
      slides: [
        "junk",
        { id: "a", layout: "split", main: [p, null, { no: "type" }], side: [], notes: 5, builds: [{ blockId: p.id, effect: "spin" }, { blockId: "gone" }, { blockId: p.id }] },
        { id: "a", layout: "canvas", main: [], side: [] },
      ],
    });
    expect(deck.theme).toBe("paper");
    expect(deck.transition).toBe("morph");
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]).toMatchObject({ id: "a", main: [p], notes: "", builds: [{ blockId: p.id, effect: "appear" }] });
    // A repeated id gets a new one; a canvas slide without a canvas becomes blank.
    expect(deck.slides[1]!.id).not.toBe("a");
    expect(deck.slides[1]!.layout).toBe("blank");
    expect(deckProblems(deck)).toEqual([]);
  });

  it("Next plays each build, then moves to the next slide; Back undoes one at a time", () => {
    const slides = [withBuilds(2), withBuilds(0), withBuilds(1)];
    const forward = [{ slide: 0, step: 0 }];
    for (let i = 0; i < 6; i++) forward.push(nextPosition(slides, forward.at(-1)!));
    expect(forward).toEqual([
      { slide: 0, step: 0 },
      { slide: 0, step: 1 },
      { slide: 0, step: 2 },
      { slide: 1, step: 0 },
      { slide: 2, step: 0 },
      { slide: 2, step: 1 },
      { slide: 2, step: 1 },
    ]);
    // Back from the start of a slide lands on the previous slide fully built.
    expect(previousPosition(slides, { slide: 1, step: 0 })).toEqual({ slide: 0, step: 2 });
    expect(previousPosition(slides, { slide: 0, step: 0 })).toEqual({ slide: 0, step: 0 });
    expect(clampPosition(slides, { slide: 9, step: 9 })).toEqual({ slide: 2, step: 1 });
    expect(clampPosition([], { slide: 3, step: 1 })).toEqual({ slide: 0, step: 0 });
  });

  it("keeps only the canvas copies a slide still shows", () => {
    const slide = newSlide("canvas", { canvas: { canvasId: "cnv_a", itemId: null } });
    const deck = toDeckDocument({ version: 1, slides: [slide], canvases: { cnv_a: { items: [] }, cnv_gone: { items: [] }, cnv_bad: "x" } });
    expect(deck.canvases).toEqual({ cnv_a: { items: [] } });
    expect(toDeckDocument({ version: 1, slides: [] }).canvases).toBeUndefined();
    expect(deckProblems({ version: 1, slides: [], canvases: [] })).toEqual(["canvases must be an object of canvas documents by id."]);
  });

  it("takes a slide's title from its first heading", () => {
    expect(slideTitle(newSlide("content", { main: [paragraph("x"), heading("Why √d", 2)] }))).toBe("Why √d");
    expect(slideTitle(newSlide())).toBe("");
  });
});
