import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCss,
  formatElapsed,
  heading,
  newSlide,
  paragraph,
  Presenter,
  PresenterView,
  SlideOutline,
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

const p1 = paragraph("First point");
const p2 = paragraph("Second point");
const deck: DeckDocument = {
  version: 1,
  theme: "paper",
  aspect: "16:9",
  transition: "none",
  slides: [
    newSlide("title", { main: [heading("Attention", 1)], notes: "Welcome everyone." }),
    newSlide("content", {
      main: [heading("Why scale", 2), p1, p2],
      builds: [
        { blockId: p1.id, effect: "fade" },
        { blockId: p2.id, effect: "rise" },
      ],
    }),
    newSlide("content", { main: [heading("Hidden", 2)], hidden: true }),
    newSlide("section", { main: [heading("The end", 1)] }),
  ],
};

const key = (k: string) => fireEvent.keyDown(window, { key: k });
const slideTitleShown = () => document.querySelector(".osl-presenter [data-type=heading]")?.textContent;
const styleText = () => document.querySelector(".osl-presenter .osl-slide style")?.textContent ?? "";

describe("Presenter", () => {
  it("steps through builds, skips hidden slides, and reports each move", () => {
    const moves: string[] = [];
    render(
      <Presenter
        deck={deck}
        fullscreen={false}
        renderBlocks={renderBlocks}
        onExit={() => {}}
        onPositionChange={(p) => moves.push(`${p.slide}.${p.step}`)}
      />,
    );
    expect(slideTitleShown()).toBe("Attention");
    key("ArrowRight");
    expect(slideTitleShown()).toBe("Why scale");
    // Both builds hidden before their clicks.
    expect(styleText()).toContain(`[data-id="${p1.id}"]{visibility:hidden`);
    expect(styleText()).toContain(`[data-id="${p2.id}"]{visibility:hidden`);
    key("PageDown");
    expect(styleText()).toContain(`[data-id="${p1.id}"]{animation:osl-build-fade`);
    expect(styleText()).toContain(`[data-id="${p2.id}"]{visibility:hidden`);
    key(" ");
    expect(styleText()).toContain(`[data-id="${p2.id}"]{animation:osl-build-rise`);
    key("ArrowRight");
    expect(slideTitleShown()).toBe("The end");
    expect(screen.getByText("3 / 3")).toBeTruthy();
    // Back lands on the previous slide fully built.
    key("ArrowLeft");
    expect(slideTitleShown()).toBe("Why scale");
    expect(styleText()).not.toContain("visibility:hidden");
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
    render(
      <Presenter
        deck={deck}
        fullscreen={false}
        renderBlocks={(blocks) => [...renderBlocks(blocks), <input key="field" aria-label="answer" />]}
        onExit={() => {}}
      />,
    );
    const field = screen.getAllByLabelText("answer")[0]!;
    fireEvent.keyDown(field, { key: "ArrowRight" });
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

describe("builds and outlines", () => {
  it("scopes build CSS to one drawing of the slide", () => {
    const css = buildCss(":r1:", deck.slides[1]!, 1, "data-id");
    expect(css.split("\n")).toEqual([
      `[data-osl-instance=":r1:"] [data-id="${p1.id}"]{animation:osl-build-fade var(--osl-build-ms,450ms) var(--osl-ease) both}`,
      `[data-osl-instance=":r1:"] [data-id="${p2.id}"]{visibility:hidden;opacity:0}`,
    ]);
    // No step (editing): everything shows.
    expect(buildCss(":r1:", deck.slides[1]!, undefined, "data-id")).toBe("");
    // A host whose renderer marks nested elements alike names the one to use.
    const outer = buildCss(":r1:", deck.slides[1]!, 0, "data-id", new Map([[p1.id, "osl-m-0"]]), (m: string) => `.outer${m}`);
    expect(outer).toContain(`[data-osl-instance=":r1:"] .outer[data-id="${p1.id}"]{view-transition-name:osl-m-0}`);
  });

  it("outlines a slide by its title, a line of text and its blocks", () => {
    const slide = newSlide("split", {
      main: [heading("Three views", 2), paragraph("Query, key, value")],
      side: [{ id: "q", type: "interactive", props: { kind: "quiz" } }, { id: "a", type: "interactive", props: { kind: "custom" } }],
    });
    const { container } = render(<SlideOutline slide={slide} />);
    expect(container.textContent).toBe("Three viewsQuery, key, valuequizapp");
  });
});
