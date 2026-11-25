import { describe, expect, it } from "vitest";
import { blockText, deckFromDesign, deckProblems, designBrief, heading, paragraph, slideTitle, type NoteBlock } from "../src/index.js";

const quiz: NoteBlock = { id: "quiz", type: "interactive", props: { kind: "quiz", spec: JSON.stringify({ title: "Scaling check", questions: [] }) }, children: [] };
const video: NoteBlock = { id: "vid", type: "manimVideo", props: { videoId: "vid_1" }, children: [] };
const canvas = { title: "Diagram", canvasId: "cnv_1", slides: [{ itemId: "f1", title: "Encoder" }], document: { version: 1, items: [] } };

const brief = () =>
  designBrief("Attention", [
    { kind: "note", title: "Attention", blocks: [heading("Why scale", 2), paragraph("Dot products grow."), quiz, video] },
    { kind: "canvas", title: "Diagram", canvas },
  ]);

describe("AI design", () => {
  it("briefs the model with the text and numbered refs for blocks and canvas parts", () => {
    const b = brief();
    expect(b.text).toContain("### Why scale");
    expect(b.text).toContain('[B1: quiz "Scaling check"]');
    expect(b.text).toContain("[B2: explainer video]");
    expect(b.text).toContain('[C3: canvas part "Encoder"]');
    expect([...b.refs.keys()]).toEqual(["B1", "B2", "C3"]);
  });

  it("builds the plan with the source's own blocks, correcting layouts to what each slide holds", () => {
    const plan = {
      slides: [
        { layout: "title", title: "Attention", points: ["How transformers look"], notes: "Hello" },
        { layout: "media", title: "Check yourself", points: ["Answer first"], refs: ["B1"] },
        { layout: "content", title: "Where it sits", refs: ["C3"] },
        { layout: "poster", title: "Recap", points: ["Scale keeps it trainable"], refs: ["B99"] },
        { layout: "title", title: "Part 2" },
      ],
    };
    const deck = deckFromDesign(plan, brief());
    expect(deck.slides.map((s) => [s.layout, slideTitle(s)])).toEqual([
      ["title", "Attention"],
      ["split", "Check yourself"],
      ["canvas", "Where it sits"],
      ["content", "Recap"],
      ["section", "Part 2"],
      // The video the plan left out still gets a slide.
      ["media", ""],
    ]);
    expect(deck.slides[1]!.side[0]).toBe(quiz);
    expect(blockText(deck.slides[0]!.main[1]!)).toBe("How transformers look");
    expect(deck.slides[0]!.notes).toBe("Hello");
    expect(deck.slides[5]!.main[0]).toBe(video);
    expect(deck.canvases).toEqual({ cnv_1: canvas.document });
    expect(deckProblems(deck)).toEqual([]);
  });

  it("never trusts the plan: junk gives a title slide plus every block", () => {
    const deck = deckFromDesign({ slides: "nope" }, brief());
    expect(deck.slides.map((s) => s.layout)).toEqual(["title", "media", "media", "canvas"]);
    expect(deckProblems(deck)).toEqual([]);
  });

  it("caps points and text", () => {
    const deck = deckFromDesign({ slides: [{ layout: "content", title: "x".repeat(500), points: Array(20).fill("p") }] }, designBrief("T", []));
    expect(slideTitle(deck.slides[0]!).length).toBe(90);
    expect(deck.slides[0]!.main.length).toBe(7);
  });
});
