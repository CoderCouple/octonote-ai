"use client";

import "@octonote/slides/styles.css";
import "../slides.css";
import {
  clampPosition,
  enterPresentationFullscreen,
  nextPosition,
  Presenter,
  previousPosition,
  SlideStage,
  SlideView,
  visibleDeckSlides,
  type DeckDocument,
  type DeckPosition,
} from "@octonote/slides";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSlideRenderers } from "../lib/renderers";

/**
 * Going through a deck at your own pace: the slide (live blocks), back and
 * next one click at a time, ← → keys, and full-screen presenting. Shared by
 * the published page and the embed player.
 */
export function DeckPlayer({
  deck,
  start = 0,
  fit = "width",
  className,
  actions,
  position,
  onPositionChange,
}: {
  deck: DeckDocument;
  /** The slide to open on (among the shown slides, from 0). */
  start?: number;
  /** width: as wide as the page; contain: fills a fixed-height box (the embed). */
  fit?: "width" | "contain";
  className?: string;
  /** Extra buttons in the control row (PDF, open in Octonote). */
  actions?: ReactNode;
  /** Controlled position (with onPositionChange), for a page that also lists the slides. */
  position?: DeckPosition;
  onPositionChange?: (at: DeckPosition) => void;
}) {
  const slides = useMemo(() => visibleDeckSlides(deck), [deck]);
  const renderers = useSlideRenderers(deck);
  const [own, setOwn] = useState<DeckPosition>(() => clampPosition(slides, { slide: start, step: 0 }));
  const at = position ? clampPosition(slides, position) : own;
  const atRef = useRef(at);
  atRef.current = at;
  const [presenting, setPresenting] = useState(false);
  const slide = slides[at.slide];
  const changeRef = useRef(onPositionChange);
  changeRef.current = onPositionChange;
  const go = useCallback((target: DeckPosition) => {
    setOwn(target);
    changeRef.current?.(target);
  }, []);
  const next = () => go(nextPosition(slides, atRef.current));
  const prev = () => go(previousPosition(slides, atRef.current));

  // ← → step through, unless the reader is typing into a block on the slide.
  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable='true'], [role='slider']")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(nextPosition(slides, atRef.current));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(previousPosition(slides, atRef.current));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slides, go]);

  const button = "hover:bg-accent grid size-9 place-items-center rounded-full border bg-background";
  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {slide ? (
        <section aria-label={`Slide ${at.slide + 1} of ${slides.length}`} aria-roledescription="slide" className={fit === "contain" ? "min-h-0 flex-1" : undefined}>
          <SlideStage aspect={deck.aspect} fit={fit} className={fit === "width" ? "overflow-hidden rounded-xl border shadow-sm" : undefined}>
            <SlideView deck={deck} slide={slide} step={at.step} {...renderers} />
          </SlideStage>
        </section>
      ) : (
        <p className="text-muted-foreground flex-1 py-24 text-center text-sm">This presentation has no slides yet.</p>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={prev} aria-label="Back" className={button}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-muted-foreground min-w-16 text-center text-sm tabular-nums" aria-live="polite">
          {slides.length ? `${at.slide + 1} / ${slides.length}` : "0 / 0"}
        </span>
        <button type="button" onClick={next} aria-label="Next" className={button}>
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          disabled={!slides.length}
          onClick={() => {
            enterPresentationFullscreen();
            setPresenting(true);
          }}
          className="bg-primary text-primary-foreground ml-1 flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:opacity-50"
        >
          <Maximize2 className="size-3.5" /> Present
        </button>
        {actions}
      </div>
      {presenting ? (
        <Presenter
          deck={deck}
          start={at}
          onExit={() => setPresenting(false)}
          onPositionChange={go}
          {...renderers}
        />
      ) : null}
    </div>
  );
}
