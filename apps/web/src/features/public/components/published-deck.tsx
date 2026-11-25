"use client";

/**
 * A published presentation. Readers go through it at their own pace (← → or
 * the buttons, one build at a time), with every block live: they can take
 * the quiz, drag the sliders, run the apps. Present plays it full screen.
 * Presenter notes never reach this page (the API strips them).
 */
import "@octonote/slides/styles.css";
import "@/features/decks/slides.css";
import { clampPosition, SlideOutline, toDeckDocument, visibleDeckSlides, type DeckPosition } from "@octonote/slides";
import { FileDown, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeckPlayer } from "@/features/decks/components/deck-player";
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
  const resolver = useMemo(() => publicCanvasResolver(slug), [slug]);
  const [at, setAt] = useState<DeckPosition>({ slide: 0, step: 0 });
  const title = published.title || "Untitled presentation";
  const author = byline.author?.name ?? null;
  const date = new Date(byline.publishedAt ?? published.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  // Inside a published notebook the deck has its own path; on its own it's the root.
  const printHref = notebook ? `/print/pub/${slug}/${published.id}` : `/print/pub/${slug}`;

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

          <DeckPlayer
            deck={deck}
            position={at}
            onPositionChange={setAt}
            actions={
              <a href={printHref} target="_blank" rel="noopener" className="hover:bg-accent flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm">
                <FileDown className="size-3.5" /> PDF
              </a>
            }
          />

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
      </CanvasReferenceContext.Provider>
    </VotesProvider>
  );
}
