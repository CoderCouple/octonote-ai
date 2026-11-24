import { describe, expect, it } from "vitest";
import {
  addSlide,
  deckProblems,
  duplicateSlide,
  emptyDeck,
  heading,
  moveBuild,
  moveSlide,
  newSlide,
  paragraph,
  removeSlide,
  setBuild,
  slideTitle,
  updateSlide,
  type DeckDocument,
} from "../src/index.js";

const titles = (deck: DeckDocument) => deck.slides.map((s) => slideTitle(s));
const named = (...names: string[]): DeckDocument => ({ ...emptyDeck(), slides: names.map((n) => newSlide("content", { main: [heading(n, 2)] })) });

describe("deck operations", () => {
  it("adds after a slide, duplicates with fresh ids, removes, moves", () => {
    let deck = named("A", "B");
    const added = addSlide(deck, 0, "section");
    expect([added.index, added.deck.slides.map((s) => s.layout)]).toEqual([1, ["content", "section", "content"]]);
    deck = moveSlide(named("A", "B", "C"), 0, 2);
    expect(titles(deck)).toEqual(["B", "C", "A"]);
    const dup = duplicateSlide(deck, 1);
    expect(titles(dup.deck)).toEqual(["B", "C", "C", "A"]);
    expect(dup.deck.slides[2]!.id).not.toBe(dup.deck.slides[1]!.id);
    expect(dup.deck.slides[2]!.main[0]!.id).not.toBe(dup.deck.slides[1]!.main[0]!.id);
    expect(deckProblems(dup.deck)).toEqual([]);
    const removed = removeSlide(dup.deck, 3);
    expect([removed.index, titles(removed.deck)]).toEqual([2, ["B", "C", "C"]]);
    // The last slide can't be removed.
    expect(removeSlide(named("Only"), 0).deck.slides).toHaveLength(1);
  });

  it("a duplicate keeps its builds, pointed at its own blocks", () => {
    const p = paragraph("p");
    const deck: DeckDocument = { ...emptyDeck(), slides: [newSlide("content", { main: [p], builds: [{ blockId: p.id, effect: "rise" }] })] };
    const copy = duplicateSlide(deck, 0).deck.slides[1]!;
    expect(copy.builds).toEqual([{ blockId: copy.main[0]!.id, effect: "rise" }]);
  });

  it("drops builds for blocks a new layout no longer shows", () => {
    const a = paragraph("left");
    const b = paragraph("right");
    const slide = newSlide("split", { main: [a], side: [b], builds: [{ blockId: a.id, effect: "fade" }, { blockId: b.id, effect: "fade" }] });
    const deck = updateSlide({ ...emptyDeck(), slides: [slide] }, slide.id, { layout: "content" });
    expect(deck.slides[0]!.builds).toEqual([{ blockId: a.id, effect: "fade" }]);
    const none = updateSlide(deck, slide.id, { main: [] });
    expect(none.slides[0]!.builds).toBeUndefined();
  });

  it("adds, changes, reorders and removes builds", () => {
    const [a, b] = [paragraph("a"), paragraph("b")];
    let slide = newSlide("content", { main: [a, b] });
    slide = { ...slide, builds: setBuild(slide, a.id, "fade") };
    slide = { ...slide, builds: setBuild(slide, b.id, "rise") };
    slide = { ...slide, builds: setBuild(slide, a.id, "wipe") };
    expect(slide.builds).toEqual([{ blockId: a.id, effect: "wipe" }, { blockId: b.id, effect: "rise" }]);
    slide = { ...slide, builds: moveBuild(slide, b.id, -1) };
    expect(slide.builds!.map((x) => x.blockId)).toEqual([b.id, a.id]);
    expect(moveBuild(slide, b.id, -1)).toBe(slide.builds);
    slide = { ...slide, builds: setBuild(slide, a.id, null) };
    slide = { ...slide, builds: setBuild(slide, b.id, null) };
    expect(slide.builds).toBeUndefined();
  });
});
