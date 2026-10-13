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

  const sections = useMemo(
    () => (note ? collectSections(note.document) : []),
    [note],
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
        <header className="grid shrink-0 gap-2.5 border-b px-4 pt-2 pb-2.5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-6 lg:px-6 lg:py-3">
          <div className="flex min-w-0 flex-col">
            {notebook ? (
              <div className="lg:hidden">
                <NotebookLine nb={notebook} />
              </div>
            ) : (
              <div className="lg:hidden [&>a]:mb-1">{back}</div>
            )}
            <span className="text-muted-foreground hidden text-2xs font-semibold tracking-[0.08em] uppercase lg:block">
              {notebook ? `Project · in ${notebook.name}` : "Project"}
            </span>
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
              {figures ? (
                <span className="hidden lg:inline">
                  {` · ${figures} ${figures === 1 ? "figure" : "figures"}`}
                </span>
              ) : null}
            </p>
          </div>

          {both ? (
            <>
              <Segmented
                className="hidden lg:inline-flex"
                label="View"
                value={deskMode}
                onChange={setDeskMode}
                options={[
                  { value: "notes", label: "Note" },
                  { value: "split", label: "Split" },
                  { value: "canvas", label: "Canvas" },
                ]}
              />
              <Segmented
                className="grid grid-cols-2 lg:hidden"
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
            </>
          ) : (
            <span className="hidden lg:block" />
          )}

          <div className="hidden items-center justify-end gap-2 lg:flex">
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
                  />
                  <p className="text-muted-foreground mt-16 border-t pt-6 text-center text-xs">
                    <Link href="/" className="hover:text-foreground-strong">
                      Published with Octonote AI
                    </Link>
                    {" · "}
                    <Link
                      href="/signup"
                      className="text-foreground-strong font-semibold"
                    >
                      Make your own
                    </Link>
                  </p>
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
