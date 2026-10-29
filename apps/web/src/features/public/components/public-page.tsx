"use client";

import { Check, ChevronLeft, Focus, Link2 } from "lucide-react";
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
import { MadeWithCta } from "./made-with-cta";
import { cn } from "@/lib/utils";
import type { PublicByline, PublicNote, PublicView } from "../types";
import {
  NotebookLine,
  NotebookRail,
  type NotebookContext,
} from "./notebook-nav";
import { PublishedCanvas } from "./published-canvas";
import { PublishedNotebook } from "./published-notebook";
import { PublishedProject } from "./published-project";
import { ReaderBar } from "./reader-bar";
import { VoteButtons, VotesProvider } from "./votes";
import { NotesReadOnly } from "./notes-readonly";

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
        <PublishedProject
          project={resource}
          slug={root.slug}
          byline={view.byline}
          notebook={notebook}
          back={back}
        />
      );
    case "notebook":
      return (
        <PublishedNotebook
          notebook={resource}
          slug={root.slug}
          byline={view.byline}
        />
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
  const [loaded, setLoaded] = useState<unknown[] | null>(null);
  const sections = useMemo(
    () => collectSections(loaded ?? note.document),
    [loaded, note.document],
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
                style={{ letterSpacing: "-0.025em" }}
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
              <NotesReadOnly
                initialContent={note.document}
                slug={slug}
                onLoaded={setLoaded}
              />
            </div>
            <EndOfArticle author={author} notebook={notebook} slug={slug} />
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
  slug,
}: {
  author: PublicByline["author"];
  notebook: NotebookContext | null;
  slug: string;
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

      <MadeWithCta slug={slug} />

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
