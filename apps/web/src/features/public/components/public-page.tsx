"use client";

import { BookOpen, ChevronLeft, FileText, FolderKanban, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { collectSections, computeReadingMinutes } from "@/features/notes/lib/derive-published-meta";
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
            <h1 className="truncate text-lg font-semibold">{resource.title || "Untitled canvas"}</h1>
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
            <h1 className="text-2xl font-semibold tracking-tight">{resource.name}</h1>
            {resource.description ? (
              <p className="text-muted-foreground mt-1 text-sm">{resource.description}</p>
            ) : null}
          </div>
          {/* Stacked on phones, side by side from md up. */}
          <div className="flex flex-1 flex-col md:flex-row">
            {resource.note && resource.defaultView !== "canvas" ? (
              <div className="overflow-auto md:w-1/2 md:border-r">
                <div className="mx-auto max-w-[42rem] px-4 py-8 md:px-8">
                  <NotesReadOnly initialContent={resource.note.document} slug={root.slug} />
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
          <h1 className="text-3xl font-semibold tracking-tight">{resource.name}</h1>
          {resource.items.length === 0 ? (
            <p className="text-muted-foreground mt-10 text-sm">This notebook is empty.</p>
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
                      <span className="flex-1 truncate text-sm font-medium">{item.title || "Untitled"}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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

function PublishedNote({ note, slug, back }: { note: PublicNote; slug: string; back: React.ReactNode }) {
  const { style } = useNoteTypography();
  const sections = useMemo(() => collectSections(note.document), [note.document]);
  const minutes = useMemo(() => computeReadingMinutes(note.contentMd), [note.contentMd]);

  return (
    <div className="reader-typography" style={style}>
      <ScrollProgressBar />
      <div className="fixed top-16 right-4 z-30">
        <TypographyPicker />
      </div>
      <article className="mx-auto max-w-[42rem] px-4 pt-12 pb-24 md:px-8">
        {back}
        <h1
          className="text-4xl leading-tight font-bold tracking-tight md:text-5xl"
          style={{ fontFamily: "var(--font-reader-family)" }}
        >
          {note.title || "Untitled"}
        </h1>
        <p className="text-muted-foreground mt-3 mb-8 text-sm">
          {minutes} min read · Updated{" "}
          {new Date(note.updatedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <NotesReadOnly initialContent={note.document} slug={slug} />
      </article>
      {sections.length > 1 ? (
        <div className="fixed top-1/3 right-6 hidden xl:block">
          <RightTocRail sections={sections} />
        </div>
      ) : null}
    </div>
  );
}

