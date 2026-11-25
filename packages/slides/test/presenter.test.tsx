import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockElement,
  bullet,
  formatElapsed,
  heading,
  newSlide,
  paragraph,
  Presenter,
  PresenterView,
  SlideOutline,
  textElement,
  type DeckDocument,
  type NoteBlock,
} from "../src/index.js";

afterEach(cleanup);

// jsdom has no PointerEvent; a MouseEvent with a pointer type is enough here.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventShim;
}

/** The host's block renderer: one element per block, its id in data-id, like BlockNote. */
const renderBlocks = (blocks: NoteBlock[]) =>
  blocks.map((b) => (
    <div key={b.id} data-id={b.id} data-type={b.type}>
      {(b.content as { text: string }[] | undefined)?.map((c) => c.text).join("") ?? ""}
    </div>
  ));

const box = { x: 64, y: 48, w: 800, h: 100 };
const title = (t: string, level: 1 | 2 = 2) => textElement([heading(t, level)], box, { role: "title" });
const p1 = textElement([paragraph("First point")], { ...box, y: 200 });
const p2 = textElement([paragraph("Second point")], { ...box, y: 300 });
const deck: DeckDocument = {
  version: 2,
  theme: "paper",
  aspect: "16:9",
  transition: "none",
  slides: [
    newSlide({ elements: [title("Attention", 1)], notes: "Welcome everyone." }),
    newSlide({
      elements: [title("Why scale"), p1, p2],
      animations: [
        { id: "a1", elementId: p1.id, type: "in", effect: "fade", trigger: "click", duration: 500, delay: 0 },
        { id: "a2", elementId: p2.id, type: "in", effect: "rise", trigger: "click", duration: 500, delay: 0 },
      ],
    }),
    newSlide({ elements: [title("Hidden")], hidden: true }),
    newSlide({ elements: [title("The end", 1)] }),
  ],
};

const key = (k: string) => fireEvent.keyDown(window, { key: k });
const slideTitleShown = () => document.querySelector(".osl-presenter [data-type=heading]")?.textContent;
const styleText = () => document.querySelector(".osl-presenter .osl-slide style")?.textContent ?? "";
const el = (id: string) => `[data-osl-el="${id}"]`;

describe("Presenter", () => {
  it("plays each click, skips hidden slides, and reports each move", () => {
    const moves: string[] = [];
    render(<Presenter deck={deck} fullscreen={false} renderBlocks={renderBlocks} onExit={() => {}} onPositionChange={(p) => moves.push(`${p.slide}.${p.step}`)} />);
    expect(slideTitleShown()).toBe("Attention");
    key("ArrowRight");
    expect(slideTitleShown()).toBe("Why scale");
    expect(styleText()).toContain(`${el(p1.id)}{visibility:hidden}`);
    expect(styleText()).toContain(`${el(p2.id)}{visibility:hidden}`);
    key("PageDown");
    expect(styleText()).toContain(`${el(p1.id)}{animation:osl-fx-fade`);
    expect(styleText()).toContain(`${el(p2.id)}{visibility:hidden}`);
    key(" ");
    expect(styleText()).toContain(`${el(p2.id)}{animation:osl-fx-rise`);
    key("ArrowRight");
    expect(slideTitleShown()).toBe("The end");
    expect(screen.getByText("3 / 3")).toBeTruthy();
    // Back lands on the previous slide fully played, without replaying it.
    key("ArrowLeft");
    expect(slideTitleShown()).toBe("Why scale");
    expect(styleText()).not.toContain("visibility:hidden");
    expect(styleText()).not.toContain("animation:");
    expect(moves).toEqual(["0.0", "1.0", "1.1", "1.2", "2.0", "1.2"]);
  });

  it("jumps to a typed slide number, blacks out on B, and ends on Escape", () => {
    const onExit = vi.fn();
    render(<Presenter deck={deck} fullscreen={false} renderBlocks={renderBlocks} onExit={onExit} />);
    key("3");
    key("Enter");
    expect(slideTitleShown()).toBe("The end");
    key("b");
    expect(screen.getByLabelText(/Screen off/)).toBeTruthy();
    key("ArrowLeft");
    expect(screen.queryByLabelText(/Screen off/)).toBeNull();
    key("Escape");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("leaves keys alone while someone types into a block", () => {
    render(<Presenter deck={deck} fullscreen={false} renderBlocks={(blocks) => [...renderBlocks(blocks), <input key="field" aria-label="answer" />]} onExit={() => {}} />);
    fireEvent.keyDown(screen.getAllByLabelText("answer")[0]!, { key: "ArrowRight" });
    expect(slideTitleShown()).toBe("Attention");
  });

  it("moves on a swipe", () => {
    render(<Presenter deck={deck} fullscreen={false} renderBlocks={renderBlocks} onExit={() => {}} />);
    const root = screen.getByRole("dialog");
    act(() => {
      fireEvent.pointerDown(root, { pointerType: "touch", clientX: 300, clientY: 100 });
      fireEvent.pointerUp(root, { pointerType: "touch", clientX: 120, clientY: 110 });
    });
    expect(slideTitleShown()).toBe("Why scale");
  });

  it("draws objects where they sit, with shapes and blocks", () => {
    const quiz = blockElement({ id: "q", type: "interactive", props: { kind: "quiz" }, children: [] }, { x: 500, y: 100, w: 400, h: 300 }, { rotate: 10 });
    const one: DeckDocument = { ...deck, slides: [newSlide({ elements: [quiz, { id: "s", kind: "shape", shape: "ellipse", x: 0, y: 0, w: 50, h: 50, style: { fill: "accent" } }] })] };
    render(<Presenter deck={one} fullscreen={false} renderBlocks={renderBlocks} onExit={() => {}} />);
    const q = document.querySelector<HTMLElement>(el(quiz.id))!;
    expect([q.style.left, q.style.top, q.style.width, q.style.transform]).toEqual(["500px", "100px", "400px", "rotate(10deg)"]);
    expect(q.querySelector("[data-id=q]")).toBeTruthy();
    expect(document.querySelector(`${el("s")} path`)?.getAttribute("fill")).toBe("var(--osl-accent)");
  });
});

describe("PresenterView", () => {
  it("shows the notes, what's next on the slide, and the slide list", () => {
    const visible = deck.slides.filter((s) => !s.hidden);
    const onGoTo = vi.fn();
    const props = { deck, slides: visible, startedAt: Date.now(), onNext() {}, onPrevious() {}, onGoTo, onEnd() {}, renderBlocks };
    const { rerender } = render(<PresenterView {...props} position={{ slide: 0, step: 0 }} />);
    expect(screen.getByText("Welcome everyone.")).toBeTruthy();
    expect(screen.getByText("Next · 2")).toBeTruthy();
    rerender(<PresenterView {...props} position={{ slide: 1, step: 0 }} />);
    expect(screen.getByText("No notes for this slide.")).toBeTruthy();
    expect(screen.getByText("2 more steps before the next slide.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /The end/ }));
    expect(onGoTo).toHaveBeenCalledWith(2);
  });

  it("formats the timer", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(461_000)).toBe("07:41");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});

describe("thumbnails", () => {
  it("sketch each object where it sits: titles, text, block chips", () => {
    const slide = newSlide({
      elements: [
        textElement([heading("Three views", 2)], { x: 0, y: 0, w: 480, h: 54 }),
        textElement([bullet("Query, key, value")], { x: 0, y: 60, w: 480, h: 100 }),
        blockElement({ id: "a", type: "interactive", props: { kind: "custom" } }, { x: 480, y: 0, w: 480, h: 540 }),
      ],
    });
    const { container } = render(<SlideOutline slide={slide} />);
    expect(container.textContent).toBe("Three viewsQuery, key, valueapp");
    const sketch = container.querySelectorAll<HTMLElement>(".osl-sk")[2]!;
    expect([sketch.style.left, sketch.style.width]).toEqual(["50%", "50%"]);
  });
});
