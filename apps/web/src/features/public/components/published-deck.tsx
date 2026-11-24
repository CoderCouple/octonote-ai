"use client";

/**
 * A published presentation. Readers go through it at their own pace (← → or
 * the buttons, one build at a time), with every block live: they can take
 * the quiz, drag the sliders, run the apps. Present plays it full screen.
 * Presenter notes never reach this page (the API strips them).
 */
import "@octonote/slides/styles.css";
import "@/features/decks/slides.css";
import {
  clampPosition,
  enterPresentationFullscreen,
  nextPosition,
  Presenter,
  previousPosition,
  SlideOutline,
  SlideStage,
  SlideView,
  toDeckDocument,
  visibleDeckSlides,
  type DeckPosition,
} from "@octonote/slides";
import { ChevronLeft, ChevronRight, Link2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSlideRenderers } from "@/features/decks/lib/renderers";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { cn } from "@/lib/utils";
import { publicCanvasResolver } from "../lib/public-canvas-resolver";
import type { PublicByline, PublicDeck } from "../types";
import { HeaderSlot } from "./header-slot";
import { NotebookLine, type NotebookContext } from "./notebook-nav";
import { VoteButtons, VotesProvider } from "./votes";

export function PublishedDeck({
  deck: published,
  slug,
  byline,
  notebook,
  back,
}: {
  deck: PublicDeck;
  slug: string;
  byline: PublicByline;
  notebook: NotebookContext | null;
  back: React.ReactNode;
}) {
  const deck = useMemo(() => toDeckDocument(published.document), [published.document]);
  const slides = useMemo(() => visibleDeckSlides(deck), [deck]);
  const renderers = useSlideRenderers(deck);
  const resolver = useMemo(() => publicCanvasResolver(slug), [slug]);
  const [at, setAt] = useState<DeckPosition>({ slide: 0, step: 0 });
  const [presenting, setPresenting] = useState(false);
  const title = published.title || "Untitled presentation";
  const author = byline.author?.name ?? null;
  const date = new Date(byline.publishedAt ?? published.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const slide = slides[at.slide];
  const next = () => setAt((p) => nextPosition(slides, p));
  const prev = () => setAt((p) => previousPosition(slides, p));

  // ← → step through, unless the reader is typing into a block on the slide.
  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable='true'], [role='slider']")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") next();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, slides]);

  const meta = (
    <>
      {author ? <span className="text-foreground-strong font-semibold">{author}</span> : null}
      {author ? " · " : null}
      {date} · {slides.length} {slides.length === 1 ? "slide" : "slides"}
    </>
  );

  return (
    <VotesProvider slug={slug} kind="deck" id={published.id}>
      <CanvasReferenceContext.Provider value={resolver}>
        <HeaderSlot>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <span aria-hidden className="bg-border h-6 w-px shrink-0" />
            <h1 className="text-foreground-strong max-w-[60%] shrink-0 truncate text-base font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {notebook ? `in ${notebook.name} · ` : null}
              {meta}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <VoteButtons />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success("Link copied");
              }}
              className="hover:bg-accent flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm"
            >
              <Link2 className="size-3.5" />
              Copy link
            </button>
          </div>
        </HeaderSlot>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 lg:py-6">
          <header className="flex flex-col gap-0.5 lg:hidden">
            {notebook ? <NotebookLine nb={notebook} /> : <div className="[&>a]:mb-1">{back}</div>}
            <h1 className="text-foreground-strong text-xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-sm">{meta}</p>
          </header>

          {slide ? (
            <section aria-label={`Slide ${at.slide + 1} of ${slides.length}`} aria-roledescription="slide">
              <SlideStage aspect={deck.aspect} className="overflow-hidden rounded-xl border shadow-sm">
                <SlideView deck={deck} slide={slide} step={at.step} {...renderers} />
              </SlideStage>
            </section>
          ) : (
            <p className="text-muted-foreground py-24 text-center text-sm">This presentation has no slides yet.</p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={prev} aria-label="Back" className="hover:bg-accent grid size-10 place-items-center rounded-full border">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-muted-foreground min-w-20 text-center text-sm tabular-nums" aria-live="polite">
              {slides.length ? `${at.slide + 1} / ${slides.length}` : "0 / 0"}
            </span>
            <button type="button" onClick={next} aria-label="Next" className="hover:bg-accent grid size-10 place-items-center rounded-full border">
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                enterPresentationFullscreen();
                setPresenting(true);
              }}
              disabled={!slides.length}
              className="bg-primary text-primary-foreground ml-2 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:opacity-50"
            >
              <Play className="size-3.5" /> Present
            </button>
          </div>

          <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="All slides">
            {slides.map((s, i) => (
              <li key={s.id} className="w-36 shrink-0">
                <button
                  type="button"
                  onClick={() => setAt(clampPosition(slides, { slide: i, step: 0 }))}
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === at.slide ? "true" : undefined}
                  className={cn(
                    `osl-theme-${deck.theme} relative block aspect-video w-full overflow-hidden rounded-md border bg-[var(--osl-bg)] text-left text-[var(--osl-fg)]`,
                    i === at.slide && "ring-primary ring-2 ring-offset-1",
                  )}
                >
                  <SlideOutline slide={s} />
                </button>
              </li>
            ))}
          </ol>
        </div>

        {presenting ? <Presenter deck={deck} start={{ slide: at.slide, step: 0 }} onExit={() => setPresenting(false)} {...renderers} /> : null}
      </CanvasReferenceContext.Provider>
    </VotesProvider>
  );
}
