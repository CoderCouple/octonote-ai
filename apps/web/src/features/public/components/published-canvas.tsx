"use client";

/**
 * A published canvas. The canvas fills the screen under one compact header
 * (title, byline, votes, share). Figures play the role headings play in a
 * note: a dash minimap on the right edge (hover → list; click zooms to the
 * figure; the dark dash follows the figure in the middle of the screen),
 * and on phones a Figures sheet. Opened inside a published notebook, the
 * notebook minimap sits on the left edge, as on notes.
 */
import {
  Group,
  Link2,
  Maximize2,
  Minus,
  Play,
  Plus,
  Share,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { PublicByline, PublicCanvas } from "../types";
import {
  CanvasReadOnly,
  type CanvasViewApi,
  type CanvasViewState,
} from "./canvas-readonly";
import {
  NotebookLine,
  NotebookRail,
  type NotebookContext,
} from "./notebook-nav";
import { HeaderSlot } from "./header-slot";
import { shareThisPage } from "./reader-bar";
import { VoteButtons, VotesProvider } from "./votes";

const isNarrow = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 1023px)").matches;

export function PublishedCanvas({
  canvas,
  slug,
  byline,
  notebook,
  back,
}: {
  canvas: PublicCanvas;
  slug: string;
  byline: PublicByline;
  notebook: NotebookContext | null;
  back: React.ReactNode;
}) {
  const [api, setApi] = useState<CanvasViewApi | null>(null);
  const title = canvas.title || "Untitled canvas";
  const figures = api?.figures ?? [];
  const date = new Date(
    byline.publishedAt ?? canvas.updatedAt,
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const author = byline.author?.name ?? null;
  const figureCount = figures.length
    ? `${figures.length} ${figures.length === 1 ? "figure" : "figures"}`
    : null;

  return (
    <VotesProvider slug={slug} kind="canvas" id={canvas.id}>
      <div className="flex h-[calc(100svh-3.5rem)] flex-col">
        {/* Desktop: title, byline, votes and share sit in the site header. */}
        <HeaderSlot>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <span aria-hidden className="bg-border h-6 w-px shrink-0" />
            <h1 className="text-foreground-strong max-w-[60%] shrink-0 truncate text-base font-bold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {notebook ? `in ${notebook.name} · ` : null}
              {author ? (
                <span className="text-foreground-strong font-semibold">
                  {author}
                </span>
              ) : null}
              {author ? " · " : null}
              {date}
              {figureCount ? ` · ${figureCount}` : null}
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

        {/* Phones: a compact title strip under the site header. */}
        <header className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-2 lg:hidden">
          {notebook ? (
            <NotebookLine nb={notebook} />
          ) : (
            <div className="[&>a]:mb-1">{back}</div>
          )}
          <h1 className="text-foreground-strong truncate text-xl font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {author ? (
              <span className="text-foreground-strong font-semibold">
                {author}
              </span>
            ) : null}
            {author ? " · " : null}
            {date}
            {figureCount ? ` · ${figureCount}` : null}
          </p>
        </header>

        <div className="relative flex-1">
          <CanvasStage
            canvasId={canvas.id}
            canvasDocument={canvas.document}
            title={title}
            notebook={notebook}
            onReady={setApi}
          />
        </div>
      </div>
    </VotesProvider>
  );
}

/**
 * The read-only canvas with its reading aids: the figures minimap on the
 * right edge and zoom controls (desktop), the floating votes · Figures ·
 * fit · share bar and the Figures sheet (phones). Used by published
 * canvases and by the canvas pane of published projects.
 */
export function CanvasStage({
  canvasId,
  canvasDocument,
  title,
  notebook,
  onReady,
}: {
  canvasId: string;
  canvasDocument: unknown;
  title: string;
  /** Read inside a published notebook: its minimap on the left edge. */
  notebook: NotebookContext | null;
  onReady?: (api: CanvasViewApi) => void;
}) {
  const [api, setApi] = useState<CanvasViewApi | null>(null);
  const [view, setView] = useState<CanvasViewState>({
    zoom: 1,
    activeFigureId: null,
  });
  const [figuresOpen, setFiguresOpen] = useState(false);
  // While presenting, the canvas owns the screen: hide the page's controls.
  const [presenting, setPresenting] = useState(false);
  const figures = api?.figures ?? [];
  const canPresent = (api?.slideCount ?? 0) > 0;

  return (
    <>
      <div className="relative h-full w-full">
        <CanvasReadOnly
          canvasId={canvasId}
          initialDocument={canvasDocument}
          onReady={(a) => {
            setApi(a);
            onReady?.(a);
          }}
          onViewChange={setView}
          onPresentingChange={setPresenting}
          startOnFirstFigure={isNarrow()}
        />

        {presenting ? null : (
          <>
            {figures.length > 0 ? (
              <div className="absolute top-1/2 right-3 z-20 hidden -translate-y-1/2 lg:block">
                <FiguresRail api={api!} activeId={view.activeFigureId} />
              </div>
            ) : null}
            {notebook ? (
              <div className="absolute top-1/2 left-3 z-20 hidden -translate-y-1/2 lg:block">
                <NotebookRail nb={notebook} />
              </div>
            ) : null}

            {/* Desktop: Present, then zoom controls. */}
            {api && canPresent ? (
              <button
                type="button"
                onClick={api.present}
                title="Present: the figures and frames one at a time, full screen"
                className="bg-background hover:bg-accent absolute right-[204px] bottom-16 z-20 hidden h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-md lg:flex"
              >
                <Play className="size-3.5" />
                Present
              </button>
            ) : null}
            {api ? (
              <div className="bg-background absolute right-6 bottom-16 z-20 hidden h-10 items-center rounded-xl border shadow-md lg:flex">
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={api.zoomOut}
                  className="hover:bg-accent grid size-10 place-items-center rounded-l-xl"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-12 text-center text-xs tabular-nums">
                  {Math.round(view.zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={api.zoomIn}
                  className="hover:bg-accent grid size-10 place-items-center"
                >
                  <Plus className="size-4" />
                </button>
                <span aria-hidden className="bg-border h-5 w-px" />
                <button
                  type="button"
                  onClick={api.fit}
                  className="hover:bg-accent h-10 rounded-r-xl px-3 text-xs font-semibold"
                >
                  Fit
                </button>
              </div>
            ) : null}

            {/* Phones: votes · Figures · fit · share. */}
            <div className="bg-background absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border p-1 shadow-lg lg:hidden">
              <VoteButtons size="sm" />
              <span aria-hidden className="bg-border mx-1 h-5 w-px" />
              {figures.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setFiguresOpen(true)}
                  className="hover:bg-accent flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
                >
                  <Group className="size-4" />
                  Figures
                </button>
              ) : null}
              {canPresent ? (
                <button
                  type="button"
                  aria-label="Present"
                  onClick={() => api?.present()}
                  className="hover:bg-accent grid size-10 place-items-center rounded-full"
                >
                  <Play className="size-[18px]" />
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Show the whole canvas"
                onClick={() => api?.fit()}
                className="hover:bg-accent grid size-10 place-items-center rounded-full"
              >
                <Maximize2 className="size-[18px]" />
              </button>
              <button
                type="button"
                aria-label="Share"
                onClick={() => void shareThisPage(title)}
                className="hover:bg-accent grid size-10 place-items-center rounded-full"
              >
                <Share className="size-[18px]" />
              </button>
            </div>
          </>
        )}
      </div>

      <Drawer open={figuresOpen} onOpenChange={setFiguresOpen}>
        <DrawerContent className="max-h-[75svh]">
          <DrawerHeader className="border-b px-5 pb-3 text-left">
            <DrawerTitle>Figures</DrawerTitle>
          </DrawerHeader>
          <nav aria-label="Figures on this canvas" className="overflow-auto">
            {figures.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFiguresOpen(false);
                  setTimeout(() => api?.zoomToFigure(f.id), 250);
                }}
                aria-current={
                  f.id === view.activeFigureId ? "location" : undefined
                }
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 px-5 text-left text-base",
                  f.id === view.activeFigureId
                    ? "bg-accent text-foreground-strong font-semibold"
                    : "text-muted-foreground",
                )}
              >
                <Group className="size-4 shrink-0" />
                <span className="truncate">{f.label}</span>
              </button>
            ))}
          </nav>
          <div className="border-t px-4 pt-3 pb-6">
            <button
              type="button"
              onClick={() => {
                setFiguresOpen(false);
                setTimeout(() => api?.fit(), 250);
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold"
            >
              <Maximize2 className="size-4" />
              Show the whole canvas
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Desktop: one dash per figure on the right edge; hover lists them; click zooms there. */
function FiguresRail({
  api,
  activeId,
}: {
  api: CanvasViewApi;
  activeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <nav
      aria-label="Figures on this canvas"
      className="relative flex justify-end"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div className="bg-background/95 absolute top-1/2 right-0 w-60 -translate-y-1/2 overflow-hidden rounded-xl border py-1.5 shadow-lg backdrop-blur">
          <p className="text-muted-foreground/80 px-3.5 pt-2 pb-1 text-2xs font-semibold tracking-[0.08em] uppercase">
            Figures
          </p>
          {api.figures.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => api.zoomToFigure(f.id)}
              className={cn(
                "block w-full truncate px-3.5 py-1.5 text-left text-sm",
                f.id === activeId
                  ? "bg-accent text-foreground-strong font-semibold"
                  : "text-muted-foreground hover:text-foreground-strong hover:bg-accent/60",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={api.fit}
            className="text-muted-foreground hover:text-foreground-strong mt-1 block w-full border-t px-3.5 pt-2 pb-1 text-left text-sm"
          >
            Whole canvas
          </button>
        </div>
      ) : null}
      <ul className="flex flex-col items-end gap-2 py-2 pr-1">
        {api.figures.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              aria-label={f.label}
              onClick={() => api.zoomToFigure(f.id)}
              className={cn(
                "block rounded-full transition-all",
                f.id === activeId
                  ? "bg-foreground h-1 w-9"
                  : "bg-muted-foreground/50 hover:bg-muted-foreground h-[3px] w-5",
              )}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
