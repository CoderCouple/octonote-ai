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
import { SUPPORT_EMAIL } from "@octonote/shared";
import { cn } from "@/lib/utils";
import type {
  PublicByline,
  PublicKind,
  PublicNote,
  PublicView,
} from "../types";
import {
  NotebookLine,
  NotebookRail,
  type NotebookContext,
} from "./notebook-nav";
import { PublishedCanvas } from "./published-canvas";
import { ReaderBar } from "./reader-bar";
import { VoteButtons, VotesProvider } from "./votes";
import { CanvasReadOnly } from "./canvas-readonly";
import { NotesReadOnly } from "./notes-readonly";

const KIND_ICON: Record<PublicKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

export function PublicPage({
  view,
  notebook = null,
}: {
  view: PublicView;
  /** Set when the item is read inside a published notebook (left rail / sheet). */
  notebook?: NotebookContext | null;
}) {
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
      return (
        <PublishedNote
          note={resource}
          slug={root.slug}
          back={back}
          byline={view.byline}
          notebook={notebook}
        />
      );
    case "canvas":
      return (
        <PublishedCanvas
          canvas={resource}
          slug={root.slug}
          byline={view.byline}
          notebook={notebook}
          back={back}
        />
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
  byline,
  notebook,
}: {
  note: PublicNote;
  slug: string;
  back: React.ReactNode;
  byline: PublicByline;
  notebook: NotebookContext | null;
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
  const date = new Date(
    byline.publishedAt ?? note.updatedAt,
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const author = byline.author;

  return (
    <VotesProvider slug={slug} kind="page" id={note.id}>
      {/* Reader vars (font, size, width) on the wrapper. Desktop: the reading
          column is centred between two dash rails — the notebook on the left
          (only when read inside a published notebook), headings on the right. */}
      <div
        className="reader-typography published-note"
        style={{ ...style, maxWidth: "none" }}
      >
        <ScrollProgressBar />
        <div className="fixed top-16 right-4 z-30">
          <TypographyPicker />
        </div>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pt-6 md:px-10 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--reader-content-width))_minmax(0,1fr)]">
          {/* Grid spacer; the rails themselves are pinned to the window edges. */}
          <div aria-hidden className="hidden lg:block" />
          <article className="mx-auto w-full max-w-[var(--reader-content-width)] min-w-0 pb-28 lg:pb-16">
            {notebook ? null : back}
            <header className="flex flex-col">
              {notebook ? (
                <div className="lg:hidden">
                  <NotebookLine nb={notebook} />
                </div>
              ) : null}
              <p
                className={cn(
                  "text-muted-foreground text-2xs font-medium tracking-[0.14em] uppercase",
                  notebook ? "hidden lg:block" : "",
                )}
              >
                {notebook ? `Note · in ${notebook.name}` : "Note"}
              </p>
              <h1
                className="text-foreground-strong mt-2 text-4xl leading-[1.05] font-bold tracking-tight md:mt-4 md:text-display"
                style={{ fontFamily: "var(--font-reader-family)" }}
              >
                {note.title || "Untitled"}
              </h1>
              <Byline author={author} date={date} minutes={minutes} />
              {/* Desktop/tablet action bar; phones use the floating bar. */}
              <div className="mt-6 hidden items-center justify-between border-y py-2.5 md:flex">
                <VoteButtons />
                <CopyLinkButton />
              </div>
            </header>
            <div className="mt-6 md:mt-10">
              <NotesReadOnly initialContent={note.document} slug={slug} />
            </div>
            <EndOfArticle author={author} notebook={notebook} />
          </article>
          <div aria-hidden className="hidden lg:block" />
        </div>
        {/* Desktop: the heading minimap IS the scrollbar — pinned to the right
            edge (the native scrollbar is hidden on published notes, see
            globals.css). The notebook minimap mirrors it on the left edge. */}
        {sections.length > 1 ? (
          <div className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 justify-end lg:flex">
            <RightTocRail sections={sections} />
          </div>
        ) : null}
        {notebook ? (
          <div className="fixed top-1/2 left-3 z-30 hidden -translate-y-1/2 lg:block">
            <NotebookRail nb={notebook} />
          </div>
        ) : null}
        <ReaderBar sections={sections} title={note.title || "Untitled"} />
      </div>
    </VotesProvider>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function Avatar({
  author,
  size,
}: {
  author: PublicByline["author"];
  size: "sm" | "md" | "lg";
}) {
  const box = {
    sm: "size-7 text-2xs",
    md: "size-11 text-sm",
    lg: "size-14 text-base",
  }[size];
  if (author?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={author.avatarUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", box)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-foreground-strong text-background grid shrink-0 place-items-center rounded-full font-bold",
        box,
      )}
    >
      {author?.name ? initials(author.name) : <Focus className="size-1/2" />}
    </span>
  );
}

/** Who published it, when, and how long it takes to read. */
function Byline({
  author,
  date,
  minutes,
}: {
  author: PublicByline["author"];
  date: string;
  minutes: number;
}) {
  return (
    <>
      {/* Phones: one compact line. */}
      <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm md:hidden">
        <Avatar author={author} size="sm" />
        {author?.name ? (
          <span className="text-foreground-strong font-semibold">
            {author.name}
          </span>
        ) : null}
        <span>
          · {date} · {minutes} min
        </span>
      </div>
      <div className="mt-8 hidden items-center gap-3 md:flex">
        <Avatar author={author} size="md" />
        <div className="flex flex-col">
          {author?.name ? (
            <span className="text-foreground-strong text-[15px] font-semibold">
              {author.name}
            </span>
          ) : null}
          <span className="text-muted-foreground text-sm">
            Published {date} · {minutes} min read
          </span>
        </div>
      </div>
    </>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="hover:bg-accent flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm"
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** "Was this useful?", the author card, the invite to make your own, and the footer. */
function EndOfArticle({
  author,
  notebook,
}: {
  author: PublicByline["author"];
  notebook: NotebookContext | null;
}) {
  const reportHref = () =>
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Report a published page")}&body=${encodeURIComponent(
      `Page: ${typeof window === "undefined" ? "" : window.location.href}\n\nWhat's wrong with it?\n`,
    )}`;
  return (
    <section
      className="mt-16 flex flex-col gap-5 border-t pt-8"
      aria-label="About this note"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-foreground-strong text-base font-semibold">
          Was this useful?
        </span>
        <div className="hidden md:block">
          <VoteButtons size="lg" />
        </div>
      </div>
      <div className="md:hidden">
        <VoteButtons size="lg" variant="wide" />
      </div>

      {author?.name ? (
        <div className="flex items-center gap-4 rounded-2xl border p-5 md:p-6">
          <Avatar author={author} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-muted-foreground text-2xs font-semibold tracking-[0.08em] uppercase">
              Written by
            </span>
            <span className="text-foreground-strong truncate text-lg font-bold">
              {author.name}
            </span>
            {notebook ? (
              <Link
                href={`/pub/${notebook.slug}`}
                className="text-muted-foreground hover:text-foreground-strong text-sm"
              >
                More from {notebook.name} →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="bg-muted flex flex-col gap-4 rounded-2xl p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-foreground-strong text-lg font-bold">
            Notes and canvases, together.
          </span>
          <span className="text-muted-foreground text-sm">
            This page was made with Octonote AI. Publish your own in one click.
          </span>
        </div>
        <Link
          href="/signup"
          className="bg-primary text-primary-foreground flex h-11 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-semibold"
        >
          Get started free
        </Link>
      </div>

      <footer className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-4 text-xs">
        <Link href="/" className="hover:text-foreground-strong">
          Published with Octonote AI
        </Link>
        <span aria-hidden>·</span>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          onClick={(e) => {
            e.currentTarget.href = reportHref();
          }}
          className="hover:text-foreground-strong"
        >
          Report this page
        </a>
      </footer>
    </section>
  );
}
