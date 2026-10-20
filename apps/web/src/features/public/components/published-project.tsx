"use client";

/**
 * A published project: its note and its canvas under one header (title,
 * byline, votes, share). Desktop switches Note / Split / Canvas, opening on
 * the author's saved view; phones get a Note | Canvas toggle. Each pane
 * reads like its own published page — the note with its heading minimap at
 * the pane's edge and the phone reader bar, the canvas with its figures
 * minimap, zoom controls and Figures sheet. A figure embedded in the note
 * offers "See on canvas", which switches over and zooms to it.
 *
 * Both panes stay mounted: a hidden pane is laid over the visible one,
 * invisible, so tldraw keeps its size and the reader keeps their place.
 */
import { Link2 } from "lucide-react";
import { MadeWithCta } from "./made-with-cta";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import {
  collectSections,
  computeReadingMinutes,
} from "@/features/notes/lib/derive-published-meta";
import { RightTocRail } from "@/features/notes/published/right-toc-rail";
import { useNoteTypography } from "@/features/notes/typography/use-note-typography";
import { cn } from "@/lib/utils";
import type { PublicByline, PublicProject } from "../types";
import type { CanvasViewApi } from "./canvas-readonly";
import { NotebookLine, type NotebookContext } from "./notebook-nav";
import { NotesReadOnly } from "./notes-readonly";
import { HeaderSlot } from "./header-slot";
import { CanvasStage } from "./published-canvas";
import { ReaderBar } from "./reader-bar";
import { VoteButtons, VotesProvider } from "./votes";

type DeskMode = "notes" | "split" | "canvas";
type PhoneTab = "notes" | "canvas";

const WIDE = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const useIsWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

export function PublishedProject({
  project,
  slug,
  byline,
  notebook,
  back,
}: {
  project: PublicProject;
  slug: string;
  byline: PublicByline;
  notebook: NotebookContext | null;
  back: React.ReactNode;
}) {
  const { note, canvas } = project;
  const both = Boolean(note && canvas);
  const title = project.name || "Untitled project";
  const isWide = useIsWide();

  const [deskMode, setDeskMode] = useState<DeskMode>(() =>
    !canvas ? "notes" : !note ? "canvas" : (project.defaultView ?? "split"),
  );
  const [phoneTab, setPhoneTab] = useState<PhoneTab>(() =>
    !note || (canvas && project.defaultView === "canvas") ? "canvas" : "notes",
  );
  const mode: DeskMode = isWide ? deskMode : phoneTab;
  const showNote = Boolean(note) && mode !== "canvas";
  const showCanvas = Boolean(canvas) && mode !== "notes";
  const split = showNote && showCanvas;

  const [api, setApi] = useState<CanvasViewApi | null>(null);
  const [noteEl, setNoteEl] = useState<HTMLDivElement | null>(null);
  const [pendingFigure, setPendingFigure] = useState<string | null>(null);

  const [loaded, setLoaded] = useState<unknown[] | null>(null);
  const sections = useMemo(
    () => (note ? collectSections(loaded ?? note.document) : []),
    [loaded, note],
  );
  const minutes = useMemo(
    () => (note ? computeReadingMinutes(note.contentMd) : 0),
    [note],
  );
  const { style } = useNoteTypography();
  const date = new Date(
    byline.publishedAt ?? project.updatedAt,
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const author = byline.author?.name ?? null;
  const figures = api?.figures.length ?? 0;

  const openFigure = useCallback((figureId: string) => {
    setPendingFigure(figureId);
    if (window.matchMedia(WIDE).matches) {
      setDeskMode((m) => (m === "notes" ? "split" : m));
    } else {
      setPhoneTab("canvas");
    }
  }, []);

  // Zoom to a figure asked for from the note, once the canvas is showing.
  useEffect(() => {
    if (!pendingFigure || !api || !showCanvas) return;
    const t = setTimeout(() => {
      if (!api.zoomToEmbeddedFigure(pendingFigure)) {
        toast("That figure is on another canvas.");
      }
      setPendingFigure(null);
    }, 80);
    return () => clearTimeout(t);
  }, [pendingFigure, api, showCanvas]);

  // Desktop: switching views resizes the canvas pane, so re-fit it (unless
  // a figure is about to be zoomed to).
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (!isWide || !api || pendingFigure) return;
    if (deskMode === "notes") return;
    const t = setTimeout(() => api.fit(), 80);
    return () => clearTimeout(t);
    // Only when the view changes, not when a pending zoom clears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskMode]);

  const pane = (visible: boolean, edge: boolean) =>
    visible
      ? cn(
          "relative h-full min-w-0 overflow-hidden",
          split ? "w-1/2" : "flex-1",
          edge && "border-r",
        )
      : "pointer-events-none invisible absolute inset-0";

  return (
    <VotesProvider slug={slug} kind="project" id={project.id}>
      <div className="flex h-[calc(100svh-3.5rem)] flex-col">
        {/* Desktop: title, byline, view switcher, votes and share sit in the site header. */}
        <HeaderSlot>
          <div className="hidden min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 lg:grid">
            <div className="flex min-w-0 items-center gap-3">
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
                {note ? ` · ${minutes} min read` : null}
              </p>
            </div>
            {both ? (
              <Segmented
                className="inline-flex"
                label="View"
                value={deskMode}
                onChange={setDeskMode}
                options={[
                  { value: "notes", label: "Note" },
                  { value: "split", label: "Split" },
                  { value: "canvas", label: "Canvas" },
                ]}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center justify-end gap-2">
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
          </div>
        </HeaderSlot>

        {/* Phones: a compact title strip and the Note | Canvas toggle. */}
        <header className="grid shrink-0 gap-2.5 border-b px-4 pt-2 pb-2.5 lg:hidden">
          <div className="flex min-w-0 flex-col">
            {notebook ? (
              <NotebookLine nb={notebook} />
            ) : (
              <div className="[&>a]:mb-1">{back}</div>
            )}
            <h1 className="text-foreground-strong truncate text-xl font-extrabold tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground truncate text-sm">
              {author ? (
                <span className="text-foreground-strong font-semibold">
                  {author}
                </span>
              ) : null}
              {author ? " · " : null}
              {date}
              {note ? ` · ${minutes} min read` : null}
            </p>
          </div>
          {both ? (
            <Segmented
              className="grid grid-cols-2"
              label="View"
              value={phoneTab}
              onChange={setPhoneTab}
              options={[
                { value: "notes", label: "Note" },
                {
                  value: "canvas",
                  label: figures
                    ? `Canvas · ${figures} ${figures === 1 ? "figure" : "figures"}`
                    : "Canvas",
                },
              ]}
            />
          ) : null}
        </header>

        <div className="relative flex min-h-0 flex-1">
          {note ? (
            <section
              aria-label="Note"
              aria-hidden={!showNote || undefined}
              inert={!showNote}
              className={pane(showNote, split)}
            >
              <div
                ref={setNoteEl}
                className={cn(
                  "h-full overflow-y-auto",
                  sections.length > 1 && "hide-scrollbar",
                )}
              >
                <div
                  className="reader-typography mx-auto w-full max-w-[var(--reader-content-width)] px-5 pt-6 pb-28 md:px-10 lg:pt-10 lg:pb-16"
                  style={{ ...style, maxWidth: undefined }}
                >
                  {project.description ? (
                    <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
                      {project.description}
                    </p>
                  ) : null}
                  <NotesReadOnly
                    initialContent={note.document}
                    slug={slug}
                    onOpenFigure={canvas ? openFigure : undefined}
                    onLoaded={setLoaded}
                  />
                  <MadeWithCta slug={slug} className="mt-16" />
                </div>
              </div>
              {/* The heading minimap is the note pane's scrollbar. */}
              {sections.length > 1 ? (
                <div className="absolute top-1/2 right-3 z-20 hidden -translate-y-1/2 justify-end lg:flex">
                  <RightTocRail sections={sections} scrollRoot={noteEl} />
                </div>
              ) : null}
              <ReaderBar
                sections={sections}
                title={title}
                scrollRoot={noteEl}
              />
            </section>
          ) : null}

          {canvas ? (
            <section
              aria-label="Canvas"
              aria-hidden={!showCanvas || undefined}
              inert={!showCanvas}
              className={pane(showCanvas, false)}
            >
              <CanvasStage
                canvasDocument={canvas.document}
                title={title}
                notebook={null}
                onReady={setApi}
              />
            </section>
          ) : null}
        </div>
      </div>
    </VotesProvider>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("bg-muted gap-0.5 rounded-[10px] p-[3px]", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors",
            o.value === value
              ? "bg-background text-foreground-strong shadow-sm"
              : "text-muted-foreground hover:text-foreground-strong",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
