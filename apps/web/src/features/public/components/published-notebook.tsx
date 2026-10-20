"use client";

/**
 * A published notebook: the front page of a small publication. A header
 * (name, item count, author, votes, share), kind filters, and the items as
 * a grid of cards or a list of rows — the reader's choice, remembered in
 * their browser (grid on desktop, list on phones until they pick). Cards
 * show a canvas thumbnail (a project's canvas) or a note's opening lines.
 */
import {
  BookOpen,
  Check,
  FileText,
  FolderKanban,
  LayoutGrid,
  Link2,
  List,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  PublicByline,
  PublicKind,
  PublicNotebook,
  PublicNotebookItem,
} from "../types";
import { MadeWithCta } from "./made-with-cta";
import { ReaderBar } from "./reader-bar";
import { VoteButtons, VotesProvider } from "./votes";

type View = "grid" | "list";
type KindFilter = "all" | "page" | "canvas" | "project";

const KIND_NAME: Record<PublicKind, string> = {
  page: "Note",
  canvas: "Canvas",
  project: "Project",
  notebook: "Notebook",
};
const KIND_ICON: Record<PublicKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};
const FILTERS: [KindFilter, string][] = [
  ["all", "All"],
  ["page", "Notes"],
  ["canvas", "Canvases"],
  ["project", "Projects"],
];
// Reading order on the page: projects (note + canvas) first, then notes, then canvases.
const ORDER: Record<PublicKind, number> = {
  project: 0,
  page: 1,
  canvas: 2,
  notebook: 3,
};

const VIEW_KEY = "octonote:pub-notebook-view";

function useReaderView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("grid");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {
      // Storage blocked: fall back to the screen-size default.
    }
    if (saved === "grid" || saved === "list") setView(saved);
    else if (window.matchMedia("(max-width: 767px)").matches) setView("list");
  }, []);
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        // Not remembered; fine for this visit.
      }
    },
  ];
}

export function PublishedNotebook({
  notebook,
  slug,
  byline,
}: {
  notebook: PublicNotebook;
  slug: string;
  byline: PublicByline;
}) {
  const [view, setView] = useReaderView();
  const [filter, setFilter] = useState<KindFilter>("all");
  const items = useMemo(
    () =>
      [...notebook.items].sort(
        (a, b) =>
          ORDER[a.kind] - ORDER[b.kind] ||
          b.updatedAt.localeCompare(a.updatedAt),
      ),
    [notebook.items],
  );
  const counts = useMemo(() => {
    const c: Record<KindFilter, number> = {
      all: items.length,
      page: 0,
      canvas: 0,
      project: 0,
    };
    for (const i of items) if (i.kind in c) c[i.kind as KindFilter] += 1;
    return c;
  }, [items]);
  const shown =
    filter === "all" ? items : items.filter((i) => i.kind === filter);
  const filters = FILTERS.filter(([k]) => k === "all" || counts[k] > 0);

  const author = byline.author;
  const published = new Date(
    byline.publishedAt ?? notebook.updatedAt,
  ).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const updated = new Date(notebook.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const title = notebook.name || "Untitled notebook";

  return (
    <VotesProvider slug={slug} kind="notebook" id={notebook.id}>
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 pb-28 md:px-10 md:pt-14 lg:pb-16">
        <header className="flex flex-col gap-2 md:gap-3.5">
          <p className="text-muted-foreground text-2xs font-semibold tracking-[0.14em] uppercase">
            Notebook · {items.length} {items.length === 1 ? "item" : "items"}
          </p>
          <h1 className="text-foreground-strong text-3xl leading-[1.08] font-extrabold tracking-tight md:text-5xl">
            {title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3 md:mt-3 md:border-y md:py-3">
            <div className="flex items-center gap-2.5 md:gap-3">
              <AuthorAvatar author={author} />
              <span className="flex flex-col">
                {author?.name ? (
                  <span className="text-foreground-strong text-sm font-semibold md:text-[15px]">
                    {author.name}
                  </span>
                ) : null}
                <span className="text-muted-foreground text-xs md:text-sm">
                  Published {published}
                  {updated !== published ? ` · updated ${updated}` : null}
                </span>
              </span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <VoteButtons />
              <CopyLink />
            </div>
          </div>
        </header>

        <div className="mt-6 flex items-center justify-between gap-3 border-b pb-3 md:mt-8 md:border-0 md:pb-0">
          <div
            role="tablist"
            aria-label="Filter by kind"
            className="hide-scrollbar flex min-w-0 gap-1.5 overflow-x-auto"
          >
            {filters.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                  filter === k
                    ? "bg-foreground-strong text-background border-transparent font-semibold"
                    : "text-foreground hover:bg-accent font-medium",
                )}
              >
                {label}
                <span
                  className={cn(
                    "tabular-nums",
                    filter === k ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {counts[k]}
                </span>
              </button>
            ))}
          </div>
          <ViewToggle value={view} onChange={setView} />
        </div>

        {shown.length === 0 ? (
          <p className="text-muted-foreground mt-12 text-center text-sm">
            This notebook is empty.
          </p>
        ) : view === "grid" ? (
          <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <ItemCard item={item} href={hrefFor(slug, item)} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-2 flex flex-col md:mt-5 md:border-t">
            {shown.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <ItemRow item={item} href={hrefFor(slug, item)} />
              </li>
            ))}
          </ul>
        )}

        <MadeWithCta slug={slug} className="mt-16" />
      </div>
      <ReaderBar sections={[]} title={title} />
    </VotesProvider>
  );
}

function hrefFor(slug: string, item: PublicNotebookItem) {
  return `/pub/${slug}/${item.kind}/${item.id}`;
}

function metaLine(item: PublicNotebookItem) {
  const date = new Date(item.updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return item.minutes ? `${item.minutes} min read · ${date}` : date;
}

/** The card's picture: a canvas thumbnail, a note's opening, or the kind. */
function Picture({
  item,
  size,
}: {
  item: PublicNotebookItem;
  size: "card" | "row";
}) {
  const Icon = KIND_ICON[item.kind];
  if (item.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumbnailUrl}
        alt=""
        loading="lazy"
        className="h-full w-full bg-white object-contain p-2"
      />
    );
  }
  if (item.excerpt) {
    return (
      <span
        className={cn(
          "bg-background text-muted-foreground block h-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
          size === "card"
            ? "px-5 pt-4 text-sm leading-relaxed"
            : "px-2 pt-1.5 text-[7px] leading-snug",
        )}
      >
        {item.excerpt}
      </span>
    );
  }
  return (
    <span className="grid h-full place-items-center">
      <Icon
        className={cn(
          "text-muted-foreground/70",
          size === "card" ? "size-8" : "size-5",
        )}
      />
    </span>
  );
}

function ItemCard({ item, href }: { item: PublicNotebookItem; href: string }) {
  return (
    <Link
      href={href}
      className="group bg-card flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-md"
    >
      <span className="bg-muted/40 block aspect-[16/10] overflow-hidden border-b">
        <Picture item={item} size="card" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <span className="text-muted-foreground text-2xs font-semibold tracking-[0.08em] uppercase">
          {item.kind === "project"
            ? "Project · note + canvas"
            : KIND_NAME[item.kind]}
        </span>
        <span className="text-foreground-strong line-clamp-2 text-[17px] leading-snug font-bold underline-offset-4 group-hover:underline">
          {item.title || "Untitled"}
        </span>
        <span className="text-muted-foreground mt-auto pt-1 text-sm">
          {metaLine(item)}
        </span>
      </span>
    </Link>
  );
}

function ItemRow({ item, href }: { item: PublicNotebookItem; href: string }) {
  return (
    <Link
      href={href}
      className="group hover:bg-accent/40 flex items-center gap-4 border-b py-3.5 transition-colors md:gap-5 md:px-2 md:py-4"
    >
      <span className="bg-muted/40 block h-14 w-[72px] shrink-0 overflow-hidden rounded-lg border md:h-[76px] md:w-[120px]">
        <Picture item={item} size="row" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-foreground-strong line-clamp-2 text-[15px] leading-snug font-bold underline-offset-4 group-hover:underline md:text-[17px]">
          {item.title || "Untitled"}
        </span>
        {item.excerpt ? (
          <span className="text-muted-foreground hidden truncate text-sm md:block">
            {item.excerpt}
          </span>
        ) : null}
        <span className="text-muted-foreground text-xs md:text-sm">
          {KIND_NAME[item.kind]} · {metaLine(item)}
        </span>
      </span>
    </Link>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: View;
  onChange: (v: View) => void;
}) {
  const options: [View, string, typeof List][] = [
    ["grid", "Grid view", LayoutGrid],
    ["list", "List view", List],
  ];
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="bg-muted flex h-9 shrink-0 items-center gap-0.5 rounded-lg p-[3px]"
    >
      {options.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "grid h-full w-8 place-items-center rounded-md transition-colors",
            value === v
              ? "bg-background text-foreground-strong shadow-sm"
              : "text-muted-foreground hover:text-foreground-strong",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

function AuthorAvatar({ author }: { author: PublicByline["author"] }) {
  if (author?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.avatarUrl}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover md:size-10"
      />
    );
  }
  const initials = (author?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="bg-foreground-strong text-background grid size-7 shrink-0 place-items-center rounded-full text-2xs font-bold md:size-10 md:text-sm"
    >
      {initials || <BookOpen className="size-1/2" />}
    </span>
  );
}

function CopyLink() {
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
