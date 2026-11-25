import { describe, expect, it } from "vitest";
import { planFromNote } from "../src/convert.js";
import {
  bullet,
  clampPosition,
  deckFromNote,
  deckProblems,
  emptyDeck,
  heading,
  newSlide,
  nextPosition,
  paragraph,
  previousPosition,
  slideSteps,
  slideTimeline,
  slideTitle,
  textElement,
  timelineCss,
  toDeckDocument,
  upgradeDeck,
  type DeckSlide,
  type SlideAnimation,
} from "../src/index.js";

const box = { x: 64, y: 48, w: 400, h: 200 };
const anim = (elementId: string, extra: Partial<SlideAnimation> = {}): SlideAnimation => ({
  id: crypto.randomUUID(),
  elementId,
  type: "in",
  effect: "fade",
  trigger: "click",
  duration: 500,
  delay: 0,
  ...extra,
});

describe("deck model", () => {
  it("a new deck opens on a title slide and is valid", () => {
    const deck = emptyDeck("Attention");
    expect(deck.version).toBe(2);
    expect(deck.slides[0]!.elements).toHaveLength(1);
    expect(deck.slides[0]!.elements[0]).toMatchObject({ kind: "text", role: "title" });
    expect(slideTitle(deck.slides[0]!)).toBe("Attention");
    expect(deckProblems(deck)).toEqual([]);
  });

  it("explains what's wrong with a bad deck", () => {
    expect(deckProblems(null)).toEqual(["A deck must be an object with a slides list."]);
    expect(deckProblems({ version: 3, slides: [] })[0]).toMatch(/version must be 2/);
    const s = newSlide();
    const problems = deckProblems({
      version: 2,
      slides: [s, { ...s }, { id: "x", elements: [{ id: "a", kind: "poster", x: 0, y: 0, w: 1, h: 1 }, { id: "a", kind: "text", x: "1", y: 0, w: 1, h: 1 }], notes: 3 }],
    });
    expect(problems).toEqual([
      `Slide 2 repeats the id ${s.id}.`,
      "Slide 3, object 1 has an unknown kind.",
      "Slide 3, object 2 repeats the id a.",
      "Slide 3, object 2 needs a numeric x.",
      "Slide 3, object 2 needs a blocks list.",
      "Slide 3 notes must be text.",
    ]);
  });

  it("repairs anything stored into a deck that loads", () => {
    const t = textElement([paragraph("kept")], box);
    const deck = toDeckDocument({
      version: 2,
      theme: "neon",
      slides: [
        "junk",
        {
          id: "a",
          elements: [t, { kind: "image", src: "javascript:alert(1)", x: 0, y: 0, w: 10, h: 10 }, { kind: "shape", shape: "blob", x: 0, y: 0, w: 10, h: 10, style: { fill: "red;}body{x" } }],
          animations: [anim(t.id, { effect: "spin" }), anim("gone"), anim(t.id, { blockId: "nope", trigger: "later" as never })],
          notes: 5,
        },
      ],
    });
    expect(deck.theme).toBe("paper");
    const slide = deck.slides[0]!;
    // The script image is dropped; the shape falls back to a rectangle and loses the unsafe colour.
    expect(slide.elements.map((e) => e.kind)).toEqual(["text", "shape"]);
    expect(slide.elements[1]).toMatchObject({ shape: "rect" });
    expect(slide.elements[1]!.style).toBeUndefined();
    // Unknown effect → the type's first; a missing object's animation is dropped; a missing paragraph target is dropped.
    expect(slide.animations.map((a) => [a.effect, a.trigger, a.blockId])).toEqual([
      ["appear", "click", undefined],
      ["fade", "click", undefined],
    ]);
    expect(slide.notes).toBe("");
    expect(deckProblems(deck)).toEqual([]);
  });

  it("loads version-1 decks by upgrading them", () => {
    const v1 = planFromNote({ title: "Talk", blocks: [heading("Idea", 2), bullet("a point")] });
    const deck = toDeckDocument(v1);
    expect(deck.version).toBe(2);
    expect(deck.slides.map((s) => slideTitle(s))).toEqual(["Talk", "Idea"]);
    expect(deckProblems(v1)).toEqual([]);
  });

  it("takes a slide's title from its title box, else its first heading", () => {
    const body = textElement([paragraph("x")], box);
    const titled = textElement([heading("Why √d", 2)], box);
    expect(slideTitle(newSlide({ elements: [body, titled] }))).toBe("Why √d");
    expect(slideTitle(newSlide({ elements: [body, textElement([paragraph("Named")], box, { role: "title" })] }))).toBe("Named");
    expect(slideTitle(newSlide())).toBe("");
  });
});

describe("the click timeline", () => {
  const a = textElement([paragraph("a")], box);
  const b = textElement([paragraph("b")], box);
  const c = textElement([paragraph("c")], box);
  const slide = (animations: SlideAnimation[]): DeckSlide => newSlide({ elements: [a, b, c], animations });

  it("groups effects into clicks, timing with-previous and after-previous", () => {
    const s = slide([
      anim(a.id, { trigger: "after", duration: 300 }),
      anim(b.id, { trigger: "click", duration: 400, delay: 100 }),
      anim(c.id, { trigger: "with", duration: 200 }),
      anim(a.id, { trigger: "after", type: "emphasis", effect: "pulse", duration: 600, delay: 50 }),
      anim(b.id, { trigger: "click", type: "out", effect: "fade-out" }),
    ]);
    // "After previous" waits for the effect just before it in the list (as PowerPoint does): c ends at 300.
    expect(slideTimeline(s).map((step) => step.map((t) => t.start))).toEqual([[0], [100, 100, 350], [0]]);
    expect(slideSteps(s)).toBe(2);
  });

  it("shows each step: what's still to come is hidden, what left stays gone, the step's effects play", () => {
    const s = slide([anim(a.id), anim(b.id, { trigger: "with", effect: "rise" }), anim(a.id, { type: "out", effect: "fade-out" })]);
    const css = (step: number, animate = true) => timelineCss(s, { instance: "i", step, animate });
    const at = (id: string) => `[data-osl-instance="i"] [data-osl-el="${id}"]`;
    expect(css(0)).toBe(`${at(a.id)}{visibility:hidden}\n${at(b.id)}{visibility:hidden}`);
    expect(css(1)).toBe(`${at(a.id)}{animation:osl-fx-fade 500ms var(--osl-ease) 0ms both}\n${at(b.id)}{animation:osl-fx-rise 500ms var(--osl-ease) 0ms both}`);
    expect(css(2)).toBe(`${at(a.id)}{animation:osl-fx-fade-out 500ms var(--osl-ease) 0ms both}`);
    // Going back lands on the result without replaying.
    expect(css(1, false)).toBe("");
    expect(css(2, false)).toBe(`${at(a.id)}{visibility:hidden}`);
    // In the editor (no step), everything shows.
    expect(timelineCss(s, { instance: "i" })).toBe("");
  });

  it("reveals points of a text box one at a time", () => {
    const list = textElement([bullet("one"), bullet("two")], box);
    const s = newSlide({ elements: [list], animations: list.blocks.map((blk) => anim(list.id, { blockId: blk.id })) });
    const css = timelineCss(s, { instance: "i", step: 1, blockSelector: (m) => `.outer${m}` });
    expect(css).toContain(`[data-osl-el="${list.id}"] .outer[data-id="${list.blocks[0]!.id}"]{animation:osl-fx-fade`);
    expect(css).toContain(`[data-osl-el="${list.id}"] .outer[data-id="${list.blocks[1]!.id}"]{visibility:hidden}`);
  });

  it("a highlight stays highlighted after its click", () => {
    const s = slide([anim(a.id, { type: "emphasis", effect: "highlight" }), anim(b.id)]);
    expect(timelineCss(s, { instance: "i", step: 2 })).toContain(`[data-osl-el="${a.id}"]{animation:osl-fx-highlight 1ms linear 0ms both}`);
  });

  it("Next plays each click, then moves on; Back undoes one at a time", () => {
    const slides = [slide([anim(a.id), anim(b.id)]), newSlide(), slide([anim(c.id)])];
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
    expect(previousPosition(slides, { slide: 1, step: 0 })).toEqual({ slide: 0, step: 2 });
    expect(clampPosition(slides, { slide: 9, step: 9 })).toEqual({ slide: 2, step: 1 });
    expect(clampPosition([], { slide: 3, step: 1 })).toEqual({ slide: 0, step: 0 });
  });
});

describe("upgrading version-1 decks", () => {
  it("places each layout's content where it showed, and turns builds into entrances", () => {
    const quiz = { id: "q", type: "interactive", props: { kind: "quiz" }, children: [] };
    const v1 = planFromNote({ title: "Talk", blocks: [heading("Check", 2), bullet("one"), bullet("two"), quiz] });
    const split = v1.slides[1]!;
    split.builds = [
      { blockId: split.main[1]!.id, effect: "rise" },
      { blockId: "q", effect: "wipe" },
    ];
    const deck = upgradeDeck(v1);
    const [title, s] = deck.slides as [DeckSlide, DeckSlide];
    expect(title.elements).toMatchObject([{ kind: "text", role: "title", x: 80, style: { vAlign: "middle" } }]);
    // Split: the text box on the left, the quiz on the right.
    expect(s.elements.map((e) => [e.kind, Math.round(e.x)])).toEqual([
      ["text", 64],
      ["block", 470],
    ]);
    const [text, block] = s.elements;
    expect(s.animations.map((a) => [a.elementId, a.blockId, a.effect])).toEqual([
      [text!.id, split.main[1]!.id, "rise"],
      [block!.id, undefined, "wipe"],
    ]);
    expect(deckFromNote({ title: "Talk", blocks: [heading("Check", 2), bullet("one"), bullet("two"), quiz] }).slides[1]!.elements.map((e) => e.kind)).toEqual(["text", "block"]);
    expect(deckProblems(deck)).toEqual([]);
  });
});
