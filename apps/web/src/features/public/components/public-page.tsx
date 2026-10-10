"use client";

import {
  BookOpen,
  Check,
  ChevronLeft,
  FileText,
  Focus,
  FolderKanban,
  LayoutGrid,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  collectSections,
  computeReadingMinutes,
} from "@/features/notes/lib/derive-published-meta";
import { RightTocRail } from "@/features/notes/published/right-toc-rail";
import { ScrollProgressBar } from "@/features/notes/published/scroll-progress-bar";
import { TypographyPicker } from "@/features/notes/typography/typography-picker";
import { useNoteTypography } from "@/features/notes/typography/use-note-typography";
import type { PublicKind, PublicNote, PublicView } from "../types";
import { CanvasReadOnly } from "./canvas-readonly";
import { NotesReadOnly } from "./notes-readonly";

const KIND_ICON: Record<PublicKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

export function PublicPage({ view }: { view: PublicView }) {
  const { root, resource } = view;
  const isRoot = root.kind === resource.kind && root.id === resource.id;
  const back = isRoot ? null : (
    <Link
      href={`/pub/${root.slug}`}
      className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
    >
      <ChevronLeft className="size-4" />
      {root.title}
    </Link>
  );

  switch (resource.kind) {
    case "page":
      return <PublishedNote note={resource} slug={root.slug} back={back} />;
    case "canvas":
      return (
        <div className="flex h-[calc(100svh-3.5rem)] flex-col">
          <div className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
            {back ? <div className="[&>a]:mb-0">{back}</div> : null}
            <h1 className="truncate text-lg font-semibold">
              {resource.title || "Untitled canvas"}
            </h1>
          </div>
          <div className="flex-1">
            <CanvasReadOnly initialDocument={resource.document} />
          </div>
        </div>
      );
    case "project":
      return (
        <div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
          <div className="border-b px-4 py-4 md:px-6">
            {back}
            <h1 className="text-2xl font-semibold tracking-tight">
              {resource.name}
            </h1>
            {resource.description ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {resource.description}
              </p>
            ) : null}
          </div>
          {/* Stacked on phones, side by side from md up. */}
          <div className="flex flex-1 flex-col md:flex-row">
            {resource.note && resource.defaultView !== "canvas" ? (
              <div className="overflow-auto md:w-1/2 md:border-r">
                <div className="mx-auto max-w-[42rem] px-4 py-8 md:px-8">
                  <NotesReadOnly
                    initialContent={resource.note.document}
                    slug={root.slug}
                  />
                </div>
              </div>
            ) : null}
            {resource.canvas && resource.defaultView !== "notes" ? (
              <div className="h-[70svh] md:h-auto md:flex-1">
                <CanvasReadOnly initialDocument={resource.canvas.document} />
              </div>
            ) : null}
          </div>
        </div>
      );
    case "notebook":
      return (
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
          {back}
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <BookOpen className="size-3.5" />
            Notebook
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {resource.name}
          </h1>
          {resource.items.length === 0 ? (
            <p className="text-muted-foreground mt-10 text-sm">
              This notebook is empty.
            </p>
          ) : (
            <ul className="mt-8 divide-y border-y">
              {resource.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li key={`${item.kind}:${item.id}`}>
                    <Link
                      href={`/pub/${root.slug}/${item.kind}/${item.id}`}
                      className="hover:bg-accent/40 flex items-center gap-3 px-2 py-3 transition-colors"
                    >
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="flex-1 truncate text-sm font-medium">
                        {item.title || "Untitled"}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {new Date(item.updatedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
  }
}

function PublishedNote({
  note,
  slug,
  back,
}: {
  note: PublicNote;
  slug: string;
  back: React.ReactNode;
}) {
  const { style } = useNoteTypography();
  const sections = useMemo(
    () => collectSections(note.document),
    [note.document],
  );
  const minutes = useMemo(
    () => computeReadingMinutes(note.contentMd),
    [note.contentMd],
  );
  const kicker = [
    "Note",
    new Date(note.updatedAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    `${minutes} min read`,
  ].join(" · ");

  return (
    // Reader vars (font, size, width) on the wrapper; the reading column is
    // centred in a 3-column grid with the table of contents on the right.
    <div
      className="reader-typography published-note"
      style={{ ...style, maxWidth: "none" }}
    >
      <ScrollProgressBar />
      <div className="fixed top-16 right-4 z-30">
        <TypographyPicker />
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pt-14 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--reader-content-width))_minmax(0,1fr)]">
        <div aria-hidden className="hidden lg:block" />
        <article className="mx-auto w-full max-w-[var(--reader-content-width)] min-w-0 pb-16">
          {back}
          <header className="flex flex-col gap-4">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.14em] uppercase">
              {kicker}
            </p>
            <h1
              className="text-foreground-strong text-4xl leading-[1.05] font-bold tracking-tight md:text-[54px]"
              style={{ fontFamily: "var(--font-reader-family)" }}
            >
              {note.title || "Untitled"}
            </h1>
          </header>
          <div className="mt-10">
            <NotesReadOnly initialContent={note.document} slug={slug} />
          </div>
          <PublishedFooter />
        </article>
        <aside className="hidden lg:block">
          {sections.length > 1 ? (
            <div className="sticky top-1/2 -translate-y-1/2">
              <RightTocRail sections={sections} />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** End of the article: where it came from, copy link, and the invite to make your own. */
function PublishedFooter() {
  const [copied, setCopied] = useState(false);
  return (
    <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-8">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground-strong flex items-center gap-2 text-sm"
      >
        <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md">
          <Focus className="size-3.5" strokeWidth={2.25} />
        </span>
        Published with Octonote AI
      </Link>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(window.location.href)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
          }}
          className="hover:bg-accent flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>
        <Link
          href="/signup"
          className="bg-primary text-primary-foreground flex h-9 items-center rounded-lg px-3 text-sm font-medium"
        >
          Make your own
        </Link>
      </div>
    </footer>
  );
}
