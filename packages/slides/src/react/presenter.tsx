import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  clampPosition,
  nextPosition,
  previousPosition,
  visibleDeckSlides,
  type DeckDocument,
  type DeckPosition,
  type DeckSlide,
} from "../model.js";
import { PresenterView } from "./presenter-view.js";
import { SlideView, type SlideRenderers } from "./slide-view.js";
import { SlideStage } from "./stage.js";
import { morphPairs, runSlideTransition } from "./transition.js";

export interface PresenterProps extends SlideRenderers {
  deck: DeckDocument;
  /** Where to start, among the visible slides. */
  start?: DeckPosition;
  /** Leaving: Esc, the End button, or full screen closed by the browser. */
  onExit: () => void;
  /** Every move, for a live audience to follow. */
  onPositionChange?: (position: DeckPosition, slide: DeckSlide) => void;
  /** Shown in the corner while presenting (a live session's join code). */
  overlay?: ReactNode;
  renderNotes?: (notes: string) => ReactNode;
  /** Extra panels in the presenter view (live answers, questions). */
  presenterAside?: ReactNode;
  /**
   * Present full screen. The host starts it with `enterPresentationFullscreen()`
   * in the click that opens the presenter; leaving full screen (Esc) then ends
   * the presentation. Default true.
   */
  fullscreen?: boolean;
}

/**
 * Full screen for presenting. Call it in the click that starts the
 * presentation: browsers only allow full screen straight from a click.
 */
export function enterPresentationFullscreen(): void {
  if (typeof document === "undefined" || document.fullscreenElement) return;
  void document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Keys clickers and keyboards send for "next" and "back". */
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "n", "N"]);
const BACK_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"]);

/** Typing into a block on the slide (a widget's field, an app) must not change slides. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='textbox']");
}

/** Copies the page's styles into the presenter window so blocks look the same there. */
function copyStyles(from: Document, to: Document) {
  to.head.querySelectorAll("[data-osl-copied]").forEach((n) => n.remove());
  from.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.setAttribute("data-osl-copied", "");
    to.head.appendChild(copy);
  });
  to.documentElement.className = from.documentElement.className;
  const theme = from.documentElement.getAttribute("data-theme");
  if (theme) to.documentElement.setAttribute("data-theme", theme);
  else to.documentElement.removeAttribute("data-theme");
  to.documentElement.style.colorScheme = from.documentElement.style.colorScheme;
}

/**
 * Full-screen presenting: one slide at a time, builds on each click,
 * transitions between slides, a presenter view in its own window, swipe on
 * touch screens, and B for a black screen.
 */
export function Presenter({ deck, start, onExit, onPositionChange, overlay, renderNotes, presenterAside, fullscreen = true, ...renderers }: PresenterProps) {
  const slides = useMemo(() => visibleDeckSlides(deck), [deck]);
  const [position, setPosition] = useState<DeckPosition>(() => clampPosition(slides, start ?? { slide: 0, step: 0 }));
  const [morph, setMorph] = useState<Map<string, string> | undefined>();
  const [black, setBlack] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [presenterWin, setPresenterWin] = useState<Window | null>(null);
  const [startedAt] = useState(() => Date.now());
  const root = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const busy = useRef(false);
  const presenterWinRef = useRef<Window | null>(null);
  presenterWinRef.current = presenterWin;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // A deck edited while presenting (or slides hidden) keeps the position valid.
  useEffect(() => {
    setPosition((p) => {
      const c = clampPosition(slides, p);
      return c.slide === p.slide && c.step === p.step ? p : c;
    });
  }, [slides]);

  const changeRef = useRef(onPositionChange);
  changeRef.current = onPositionChange;
  useEffect(() => {
    const slide = slides[position.slide];
    if (slide) changeRef.current?.(position, slide);
  }, [position, slides]);

  const go = useCallback(
    (target: DeckPosition) => {
      const from = positionRef.current;
      const to = clampPosition(slides, target);
      if (to.slide === from.slide && to.step === from.step) return;
      setBlack(false);
      // Builds animate by themselves; only a change of slide runs a transition.
      if (to.slide === from.slide || busy.current) {
        setPosition(to);
        return;
      }
      const next = slides[to.slide]!;
      const kind = next.transition ?? deck.transition;
      if (kind === "morph") flushSync(() => setMorph(morphPairs(slides[from.slide]!, next)));
      busy.current = true;
      void runSlideTransition(kind, () => flushSync(() => setPosition(to)), root.current, to.slide > from.slide ? 1 : -1).finally(() => {
        busy.current = false;
        setMorph(undefined);
      });
    },
    [slides, deck.transition],
  );
  const goNext = useCallback(() => go(nextPosition(slides, positionRef.current)), [go, slides]);
  const goBack = useCallback(() => go(previousPosition(slides, positionRef.current)), [go, slides]);

  const end = useCallback(() => {
    presenterWinRef.current?.close();
    if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    exitRef.current();
  }, []);

  // Keys, in this window and in the presenter window. Digits then Enter jump to a slide.
  const typed = useRef("");
  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        typed.current = (typed.current + key).slice(-4);
        return;
      }
      if (key === "Enter" && typed.current) {
        event.preventDefault();
        go({ slide: Number(typed.current) - 1, step: 0 });
        typed.current = "";
        return;
      }
      typed.current = "";
      if (NEXT_KEYS.has(key) || key === "Enter") goNext();
      else if (BACK_KEYS.has(key)) goBack();
      else if (key === "Home") go({ slide: 0, step: 0 });
      else if (key === "End") go({ slide: slides.length - 1, step: 0 });
      else if (key === "b" || key === "B" || key === ".") setBlack((b) => !b);
      else if (key === "Escape") end();
      else return;
      event.preventDefault();
    },
    [go, goNext, goBack, end, slides.length],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);
  useEffect(() => {
    if (!presenterWin) return;
    presenterWin.addEventListener("keydown", onKey);
    // Closing the window (or the browser killing it) ends presenter view, not the talk.
    const poll = window.setInterval(() => presenterWin.closed && setPresenterWin(null), 1000);
    return () => {
      presenterWin.removeEventListener("keydown", onKey);
      window.clearInterval(poll);
    };
  }, [presenterWin, onKey]);

  // Leaving full screen (the browser's own Esc) ends the talk, unless the presenter window is up.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && !presenterWinRef.current && fullscreen) exitRef.current();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fullscreen]);

  // The controls fade while the pointer rests, and the cursor with them.
  useEffect(() => {
    let timer = window.setTimeout(() => setChrome(false), 2500);
    const wake = () => {
      setChrome(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChrome(false), 2500);
    };
    const el = root.current;
    el?.addEventListener("pointermove", wake);
    el?.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(timer);
      el?.removeEventListener("pointermove", wake);
      el?.removeEventListener("pointerdown", wake);
    };
  }, []);

  // Swipe left or right on touch screens.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const openPresenterView = () => {
    // A window opened from full screen drops it; the talk goes on in the window.
    const existing = presenterWinRef.current;
    if (existing && !existing.closed) return existing.focus();
    const win = window.open("", "octonote-presenter-view", "width=1280,height=800");
    if (!win) return;
    win.document.title = "Presenter view";
    win.document.body.innerHTML = "";
    win.document.body.className = "osl-presenter-window";
    copyStyles(document, win.document);
    win.addEventListener("pagehide", () => setPresenterWin(null));
    // Recorded at once: the full-screen exit this window causes fires before React re-renders.
    presenterWinRef.current = win;
    setPresenterWin(win);
  };

  const slide = slides[position.slide];
  const presenterView = (
    <PresenterView
      deck={deck}
      slides={slides}
      position={position}
      startedAt={startedAt}
      onNext={goNext}
      onPrevious={goBack}
      onGoTo={(i) => go({ slide: i, step: 0 })}
      onEnd={end}
      renderNotes={renderNotes}
      aside={presenterAside}
      {...renderers}
    />
  );

  return (
    <div
      ref={root}
      className={`osl-presenter osl-chrome ${chrome ? "" : "osl-idle"}`}
      role="dialog"
      aria-label="Presentation"
      aria-modal="true"
      onPointerDown={(e) => {
        if (e.pointerType === "touch") swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s || e.pointerType !== "touch") return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) (dx < 0 ? goNext : goBack)();
      }}
    >
      <SlideStage aspect={deck.aspect} fit="contain" className="osl-presenter-stage">
        {slide ? (
          <div className="osl-transition-root">
            <SlideView deck={deck} slide={slide} step={position.step} morphNames={morph} {...renderers} />
          </div>
        ) : (
          <div className="osl-slide osl-empty">This deck has no slides to show.</div>
        )}
      </SlideStage>
      {black ? <button type="button" className="osl-black" aria-label="Screen off. Press B or click to show the slide." onClick={() => setBlack(false)} /> : null}
      {overlay ? <div className="osl-overlay">{overlay}</div> : null}
      <div className="osl-bar" role="toolbar" aria-label="Presentation controls">
        <button type="button" onClick={goBack} aria-label="Back">
          ←
        </button>
        <span className="osl-count" aria-live="polite">
          {slides.length ? `${position.slide + 1} / ${slides.length}` : "0 / 0"}
        </span>
        <button type="button" onClick={goNext} aria-label="Next">
          →
        </button>
        <span className="osl-sep" />
        <button type="button" onClick={openPresenterView}>
          Presenter view
        </button>
        <button type="button" onClick={() => setBlack(true)} title="Black screen (B)">
          Black
        </button>
        <button type="button" onClick={end} title="End (Esc)">
          End
        </button>
      </div>
      {presenterWin && !presenterWin.closed ? createPortal(presenterView, presenterWin.document.body) : null}
    </div>
  );
}
