"use client";

/**
 * Title search on Home: finds notes, canvases, projects and notebooks by
 * name, client-side over the lists the page already loaded. Press "/" to
 * focus, ↑/↓ to move, Enter to open.
 */
import {
  BookOpen,
  FileText,
  FolderKanban,
  LayoutGrid,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { RESOURCE_PATH, type ResourceKind } from "@/features/sharing";
import { cn } from "@/lib/utils";

export interface SearchEntry {
  kind: ResourceKind;
  id: string;
  title: string;
}

const ICON: Record<ResourceKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};
const KIND: Record<ResourceKind, string> = {
  page: "Note",
  canvas: "Canvas",
  project: "Project",
  notebook: "Notebook",
};
const MAX_RESULTS = 8;

export function HomeSearch({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, [contenteditable]"))
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (
      entries
        .map((e) => ({
          e,
          at: (e.title || "Untitled").toLowerCase().indexOf(q),
        }))
        .filter((r) => r.at !== -1)
        // Titles that start with the query first, then by where it matches.
        .sort((a, b) => a.at - b.at)
        .slice(0, MAX_RESULTS)
        .map((r) => r.e)
    );
  }, [entries, query]);

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            const r = results[active];
            router.push(RESOURCE_PATH[r.kind](r.id));
          } else if (e.key === "Escape") {
            setQuery("");
          }
        }}
        placeholder="Search notes, canvases, projects and notebooks"
        aria-label="Search by title"
        className="h-11 pl-9 text-sm"
      />
      <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 text-xs sm:block">
        /
      </kbd>
      {query.trim() ? (
        <div className="bg-popover absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border shadow-lg">
          {results.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              Nothing called “{query.trim()}”.
            </p>
          ) : (
            <ul role="listbox" aria-label="Search results" className="py-1.5">
              {results.map((r, i) => {
                const Icon = ICON[r.kind];
                return (
                  <li
                    key={`${r.kind}:${r.id}`}
                    role="option"
                    aria-selected={i === active}
                  >
                    <Link
                      href={RESOURCE_PATH[r.kind](r.id)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm",
                        i === active && "bg-accent",
                      )}
                    >
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="text-foreground-strong min-w-0 flex-1 truncate font-medium">
                        {r.title || "Untitled"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {KIND[r.kind]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
