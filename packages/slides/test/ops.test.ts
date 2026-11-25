import { describe, expect, it } from "vitest";
import {
  addAnimation,
  addSlide,
  alignElements,
  animateParagraphs,
  bullet,
  copyForClipboard,
  deckProblems,
  distributeElements,
  duplicateElements,
  duplicateSlide,
  emptyDeck,
  groupElements,
  heading,
  moveAnimation,
  moveElements,
  moveSlide,
  newSlide,
  paragraph,
  pasteFromClipboard,
  pruneAnimations,
  removeElements,
  removeSlide,
  reorderElements,
  slideFromTemplate,
  slideTitle,
  textElement,
  ungroupElements,
  updateAnimation,
  updateElements,
  withGroups,
  type DeckDocument,
  type DeckSlide,
} from "../src/index.js";

const titled = (...names: string[]): DeckDocument => ({ ...emptyDeck(), slides: names.map((n) => slideFromTemplate("content", "16:9")).map((s, i) => ({ ...s, elements: [textElement([heading(names[i]!, 2)], { x: 0, y: 0, w: 100, h: 40 })] })) });
const titles = (deck: DeckDocument) => deck.slides.map((s) => slideTitle(s));
const at = (x: number, y: number, w = 100, h = 50) => textElement([paragraph(`${x},${y}`)], { x, y, w, h });
const stage = { w: 960, h: 540 };

describe("slides", () => {
  it("adds from a template, duplicates, removes, moves", () => {
    let deck = titled("A", "B");
    const added = addSlide(deck, 0, "section");
    expect(added.index).toBe(1);
    expect(added.deck.slides[1]!.elements[0]).toMatchObject({ kind: "text", role: "title" });
    deck = moveSlide(titled("A", "B", "C"), 0, 2);
    expect(titles(deck)).toEqual(["B", "C", "A"]);
    const dup = duplicateSlide(deck, 1);
    expect(titles(dup.deck)).toEqual(["B", "C", "C", "A"]);
    expect(dup.deck.slides[2]!.id).not.toBe(dup.deck.slides[1]!.id);
    // Objects keep their ids on a duplicated slide, so a morph can match them.
    expect(dup.deck.slides[2]!.elements[0]!.id).toBe(dup.deck.slides[1]!.elements[0]!.id);
    expect(deckProblems(dup.deck)).toEqual([]);
    const removed = removeSlide(dup.deck, 3);
    expect([removed.index, titles(removed.deck)]).toEqual([2, ["B", "C", "C"]]);
    expect(removeSlide(titled("Only"), 0).deck.slides).toHaveLength(1);
  });

  it("every template makes a valid slide", () => {
    for (const t of ["title", "section", "content", "split", "media", "blank"] as const) {
      expect(deckProblems({ ...emptyDeck(), slides: [slideFromTemplate(t, "16:9")] })).toEqual([]);
    }
  });
});

describe("objects", () => {
  it("moves, but never a locked object", () => {
    const a = at(0, 0);
    const b = { ...at(100, 0), lock: true };
    const s = moveElements(newSlide({ elements: [a, b] }), [a.id, b.id], 10, 5);
    expect(s.elements.map((e) => [e.x, e.y])).toEqual([
      [10, 5],
      [100, 0],
    ]);
    // Unlocking goes through `force`.
    expect(updateElements(s, [b.id], (e) => ({ ...e, lock: false }), true).elements[1]!.lock).toBe(false);
  });

  it("duplicates with fresh ids, offset, with their animations; removing takes animations along", () => {
    const a = at(0, 0);
    let s = addAnimation(newSlide({ elements: [a] }), a.id, "in", "rise").slide;
    const dup = duplicateElements(s, [a.id]);
    s = dup.slide;
    const copy = s.elements[1]!;
    expect(copy.id).not.toBe(a.id);
    expect([copy.x, copy.y]).toEqual([16, 16]);
    expect(s.animations.map((x) => x.elementId)).toEqual([a.id, copy.id]);
    const gone = removeElements(s, [a.id]);
    expect(gone.elements.map((e) => e.id)).toEqual([copy.id]);
    expect(gone.animations.map((x) => x.elementId)).toEqual([copy.id]);
  });

  it("copies and pastes; pasted onto its own slide it lands just off the original", () => {
    const a = at(40, 40);
    const s = newSlide({ elements: [a] });
    const clip = copyForClipboard(s, [a.id]);
    const pasted = pasteFromClipboard(s, clip);
    expect(pasted.slide.elements.map((e) => [e.x, e.y])).toEqual([
      [40, 40],
      [56, 56],
    ]);
    const elsewhere = pasteFromClipboard(newSlide(), clip);
    expect(elsewhere.slide.elements.map((e) => [e.x, e.y])).toEqual([[40, 40]]);
  });

  it("changes layers, keeping the selection's own order", () => {
    const [a, b, c, d] = [at(0, 0), at(1, 0), at(2, 0), at(3, 0)];
    const s = newSlide({ elements: [a, b, c, d] });
    const order = (x: DeckSlide) => x.elements.map((e) => [a, b, c, d].indexOf(e as never));
    expect(order(reorderElements(s, [a.id, b.id], "front"))).toEqual([2, 3, 0, 1]);
    expect(order(reorderElements(s, [c.id, d.id], "back"))).toEqual([2, 3, 0, 1]);
    expect(order(reorderElements(s, [b.id], "forward"))).toEqual([0, 2, 1, 3]);
    expect(order(reorderElements(s, [c.id], "backward"))).toEqual([0, 2, 1, 3]);
  });

  it("aligns to each other, or to the slide when there's one", () => {
    const a = at(10, 10, 100, 40);
    const b = at(200, 60, 60, 40);
    const s = newSlide({ elements: [a, b] });
    expect(alignElements(s, [a.id, b.id], "right", stage).elements.map((e) => e.x + e.w)).toEqual([260, 260]);
    expect(alignElements(s, [a.id, b.id], "top", stage).elements.map((e) => e.y)).toEqual([10, 10]);
    expect(alignElements(s, [a.id], "center", stage).elements[0]!.x).toBe(430);
    expect(alignElements(s, [b.id], "bottom", stage).elements[1]!.y).toBe(500);
  });

  it("distributes three or more so the gaps are equal", () => {
    const s = newSlide({ elements: [at(0, 0, 100), at(150, 0, 50), at(400, 0, 100)] });
    const xs = distributeElements(s, s.elements.map((e) => e.id), "horizontal").elements.map((e) => e.x);
    // Room: 500; objects: 250 wide; two gaps of 125.
    expect(xs).toEqual([0, 225, 400]);
  });

  it("groups select as one; ungrouping lets go", () => {
    const [a, b, c] = [at(0, 0), at(1, 0), at(2, 0)];
    let s = groupElements(newSlide({ elements: [a, b, c] }), [a.id, b.id]);
    expect(withGroups(s, [a.id]).sort()).toEqual([a.id, b.id].sort());
    expect(withGroups(s, [c.id])).toEqual([c.id]);
    s = ungroupElements(s, [a.id, b.id]);
    expect(withGroups(s, [a.id])).toEqual([a.id]);
  });
});

describe("animations", () => {
  it("adds, changes, reorders and removes effects", () => {
    const a = at(0, 0);
    let s = newSlide({ elements: [a] });
    const first = addAnimation(s, a.id, "in");
    s = first.slide;
    s = addAnimation(s, a.id, "out", "fade-out", { trigger: "after" }).slide;
    expect(s.animations.map((x) => [x.type, x.effect, x.trigger])).toEqual([
      ["in", "fade", "click"],
      ["out", "fade-out", "after"],
    ]);
    // Changing the kind keeps a matching effect.
    s = updateAnimation(s, first.id, { type: "emphasis" });
    expect(s.animations[0]).toMatchObject({ type: "emphasis", effect: "highlight" });
    s = moveAnimation(s, first.id, 1);
    expect(s.animations.map((x) => x.type)).toEqual(["out", "emphasis"]);
  });

  it("reveals each point of a text box on its own click, skipping the heading", () => {
    const t = textElement([heading("Why", 2), bullet("one"), bullet("two")], { x: 0, y: 0, w: 400, h: 200 });
    const s = animateParagraphs(newSlide({ elements: [t] }), t.id, "rise");
    expect(s.animations.map((a) => [a.blockId, a.effect, a.trigger])).toEqual([
      [t.blocks[1]!.id, "rise", "click"],
      [t.blocks[2]!.id, "rise", "click"],
    ]);
    // A point deleted from the text drops its animation.
    const edited = { ...s, elements: [{ ...t, blocks: t.blocks.slice(0, 2) }] };
    expect(pruneAnimations(edited).animations.map((a) => a.blockId)).toEqual([t.blocks[1]!.id]);
  });
});
