"use client";

/**
 * Where a published item sits in its published notebook.
 *
 * Desktop: a dash rail on the left, styled like the right-hand contents
 * rail — one dash per item, the current one dark and longer, small gaps
 * between Notes / Canvases / Projects. Hover → the list, grouped, with the
 * current item highlighted. Phones: a compact "Notebook · 3/12 ▾" line that
 * opens the same list as a bottom sheet with Previous / Next.
 *
 * Only shown when the reader arrived through the published notebook; a
 * note published on its own never reveals the (possibly private) notebook.
 */
import {
  BookOpen,
  ChevronDown,
  FileText,
  FolderKanban,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { PublicKind } from "../types";

export interface NotebookContext {
  slug: string;
  name: string;
  items: { kind: PublicKind; id: string; title: string }[];
  current: { kind: PublicKind; id: string };
}

const GROUPS: { kind: PublicKind; label: string; icon: typeof FileText }[] = [
  { kind: "page", label: "Notes", icon: FileText },
  { kind: "canvas", label: "Canvases", icon: LayoutGrid },
  { kind: "project", label: "Projects", icon: FolderKanban },
];

const hrefOf = (nb: NotebookContext, item: { kind: PublicKind; id: string }) =>
  `/pub/${nb.slug}/${item.kind}/${item.id}`;
const isCurrent = (
  nb: NotebookContext,
  item: { kind: PublicKind; id: string },
) => item.kind === nb.current.kind && item.id === nb.current.id;

/** Items in reading order: notes, then canvases, then projects. */
function ordered(nb: NotebookContext) {
  return GROUPS.flatMap((g) => nb.items.filter((i) => i.kind === g.kind));
}

export function notebookPosition(nb: NotebookContext) {
  const list = ordered(nb);
  const index = list.findIndex((i) => isCurrent(nb, i));
  return {
    index,
    total: list.length,
    prev: index > 0 ? list[index - 1] : undefined,
    next: index >= 0 && index < list.length - 1 ? list[index + 1] : undefined,
  };
}

function GroupedList({
  nb,
  onPick,
  large,
}: {
  nb: NotebookContext;
  onPick?: () => void;
  large?: boolean;
}) {
  return (
    <>
      {GROUPS.map(({ kind, label, icon: Icon }) => {
        const items = nb.items.filter((i) => i.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind}>
            <p className="text-muted-foreground/80 px-3.5 pt-3 pb-1 text-2xs font-semibold tracking-[0.08em] uppercase">
              {label}
            </p>
            {items.map((item) => {
              const on = isCurrent(nb, item);
              return (
                <Link
                  key={`${item.kind}:${item.id}`}
                  href={hrefOf(nb, item)}
                  onClick={onPick}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 transition-colors",
                    large ? "min-h-12 text-base" : "py-1.5 text-sm",
                    on
                      ? "bg-accent text-foreground-strong font-semibold"
                      : "text-muted-foreground hover:text-foreground-strong hover:bg-accent/60",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.title || "Untitled"}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Desktop: dashes → hover card. */
export function NotebookRail({ nb }: { nb: NotebookContext }) {
  const [open, setOpen] = useState(false);
  const { index, total } = notebookPosition(nb);
  return (
    <nav
      aria-label={`In the notebook ${nb.name}`}
      className="relative w-fit"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <ul className="flex flex-col items-start gap-2 py-2 pl-1">
        {GROUPS.map(({ kind }, g) => {
          const items = nb.items.filter((i) => i.kind === kind);
          if (items.length === 0) return null;
          return items.map((item, i) => (
            <li
              key={`${item.kind}:${item.id}`}
              className={cn(g > 0 && i === 0 && "mt-2")}
            >
              <Link
                href={hrefOf(nb, item)}
                aria-label={item.title || "Untitled"}
                className={cn(
                  "block rounded-full transition-all",
                  isCurrent(nb, item)
                    ? "bg-foreground h-1 w-9"
                    : "bg-muted-foreground/50 hover:bg-muted-foreground h-[3px] w-5",
                )}
              />
            </li>
          ));
        })}
      </ul>
      {open ? (
        <div className="bg-background/95 absolute top-0 left-0 z-30 w-72 overflow-hidden rounded-xl border py-1.5 shadow-lg backdrop-blur">
          <Link
            href={`/pub/${nb.slug}`}
            className="hover:bg-accent/60 flex flex-col gap-0.5 border-b px-3.5 pt-2 pb-2.5"
          >
            <span className="text-muted-foreground text-2xs font-semibold tracking-[0.08em] uppercase">
              Notebook{index >= 0 ? ` · ${index + 1} of ${total}` : ""}
            </span>
            <span className="text-foreground-strong truncate text-sm font-bold">
              {nb.name}
            </span>
          </Link>
          <div className="max-h-[60vh] overflow-auto">
            <GroupedList nb={nb} />
          </div>
        </div>
      ) : null}
    </nav>
  );
}

/** Phones: the compact line above the title, opening a bottom sheet. */
export function NotebookLine({ nb }: { nb: NotebookContext }) {
  const [open, setOpen] = useState(false);
  const { index, total, prev, next } = notebookPosition(nb);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${nb.name}, item ${index + 1} of ${total} — show the notebook`}
        className="text-muted-foreground hover:text-foreground-strong -ml-0.5 inline-flex h-8 items-center gap-1.5 self-start text-xs font-semibold"
      >
        <BookOpen className="size-3.5" />
        <span className="max-w-[60vw] truncate">{nb.name}</span>
        {index >= 0 ? (
          <span className="tabular-nums">
            · {index + 1}/{total}
          </span>
        ) : null}
        <ChevronDown className="size-3.5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="border-b px-5 pb-3 text-left">
            <span className="text-muted-foreground text-2xs font-semibold tracking-[0.08em] uppercase">
              Notebook{index >= 0 ? ` · ${index + 1} of ${total}` : ""}
            </span>
            <DrawerTitle asChild>
              <Link
                href={`/pub/${nb.slug}`}
                className="text-foreground-strong text-xl font-bold"
              >
                {nb.name} →
              </Link>
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-auto [&_a]:px-5 [&_p]:px-5">
            <GroupedList nb={nb} large onPick={() => setOpen(false)} />
          </div>
          <div className="flex gap-2 border-t px-4 pt-3 pb-6">
            {prev ? (
              <Link
                href={hrefOf(nb, prev)}
                className="flex h-12 flex-1 items-center justify-center rounded-xl border text-sm font-semibold"
              >
                ← Previous
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {next ? (
              <Link
                href={hrefOf(nb, next)}
                className="bg-foreground-strong text-background flex h-12 flex-1 items-center justify-center rounded-xl text-sm font-semibold"
              >
                Next →
              </Link>
            ) : (
              <span className="flex-1" />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
