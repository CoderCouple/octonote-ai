"use client";

import type { BlockNoteEditor } from "@blocknote/core";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Notion-style scroll-spy mini-map for a notes page.
 *
 * Two visual states:
 *   - Collapsed (default): a vertical stack of horizontal bars, one per
 *     heading, on the right edge of the notes pane. Bar width encodes
 *     level (H1 widest → H3 narrowest); the active heading is drawn in
 *     the foreground colour.
 *   - Hovered: expands into a scrollable menu of heading text, again
 *     with the active heading highlighted. Fires `onHoverChange` so the
 *     parent can hide the notes-area scrollbar while the rail is open.
 *
 * Positioning: the rail is `position: absolute` — its parent must be
 * the *non-scrolling* wrapper of the notes editor so the rail stays
 * pinned as content scrolls underneath.
 *
 * Auto-hides when the document has fewer than `minHeadings` headings.
 */
interface TableOfContentsRailProps {
  editor: BlockNoteEditor<never, never, never>;
  /**
   * The scrollable container hosting the editor. Used as the
   * IntersectionObserver root and for smooth-scrolling on click, so
   * scroll-spy works when the rail lives outside that container.
   */
  scrollRef?: RefObject<HTMLElement | null>;
  /** Notifies the parent when the rail is (un)hovered — e.g. to hide the notes scrollbar. */
  onHoverChange?: (hovered: boolean) => void;
  /** Hide the rail when the doc has fewer than this many headings. Default 3. */
  minHeadings?: number;
}

interface HeadingEntry {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

const LEVEL_BAR_WIDTH: Record<1 | 2 | 3, string> = {
  1: "w-6",
  2: "w-4",
  3: "w-3",
};

const LEVEL_INDENT: Record<1 | 2 | 3, string> = {
  1: "pl-2",
  2: "pl-5",
  3: "pl-8",
};

const LEVEL_TEXT_SIZE: Record<1 | 2 | 3, string> = {
  1: "text-[13px] font-medium",
  2: "text-xs",
  3: "text-xs",
};

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (c && typeof c === "object" && "type" in c && c.type === "text" && "text" in c) {
        return typeof c.text === "string" ? c.text : "";
      }
      return "";
    })
    .join("");
}

function collectHeadings(blocks: unknown[]): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as {
      type?: string;
      id?: string;
      props?: { level?: number };
      content?: unknown;
      children?: unknown[];
    };
    if (b.type === "heading" && typeof b.id === "string") {
      const rawLevel = b.props?.level ?? 1;
      const level = (rawLevel >= 1 && rawLevel <= 3 ? rawLevel : 1) as 1 | 2 | 3;
      out.push({ id: b.id, text: extractText(b.content), level });
    }
    if (Array.isArray(b.children) && b.children.length > 0) {
      out.push(...collectHeadings(b.children));
    }
  }
  return out;
}

export function TableOfContentsRail({
  editor,
  scrollRef,
  onHoverChange,
  minHeadings = 3,
}: TableOfContentsRailProps) {
  const [headings, setHeadings] = useState<HeadingEntry[]>(() =>
    collectHeadings(editor.document as unknown[]),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const headingsRef = useRef(headings);
  headingsRef.current = headings;

  // Keep the heading list in sync with the editor document. BlockNote's
  // onChange fires on every keystroke; cheap structural equality avoids
  // re-render for typical typing.
  useEffect(() => {
    return editor.onChange(() => {
      const next = collectHeadings(editor.document as unknown[]);
      const prev = headingsRef.current;
      if (
        prev.length === next.length &&
        prev.every(
          (h, i) =>
            h.id === next[i]!.id &&
            h.text === next[i]!.text &&
            h.level === next[i]!.level,
        )
      ) {
        return;
      }
      setHeadings(next);
    });
  }, [editor]);

  // Scroll-spy. `rootMargin` pushes the activation line ~30% down the
  // container so the highlighted entry reads as "the section I'm in".
  useEffect(() => {
    if (headings.length < minHeadings) {
      setActiveId(null);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        const id = top.target.getAttribute("data-id");
        if (id) setActiveId(id);
      },
      {
        root: scrollRef?.current ?? null,
        rootMargin: "0px 0px -70% 0px",
        threshold: 0,
      },
    );
    for (const h of headings) {
      const el = document.querySelector(`[data-id="${h.id}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings, minHeadings, scrollRef]);

  const visibleHeadings = useMemo(
    () => (headings.length >= minHeadings ? headings : []),
    [headings, minHeadings],
  );

  if (visibleHeadings.length === 0) return null;

  function jumpTo(id: string) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEnter() {
    setExpanded(true);
    onHoverChange?.(true);
  }
  function handleLeave() {
    setExpanded(false);
    onHoverChange?.(false);
  }

  return (
    <nav
      aria-label="Table of contents"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="absolute top-1/2 right-3 z-20 -translate-y-1/2"
    >
      {/*
       * Two states share the same anchor position:
       *   - `expanded`: text menu, scrollable, right-aligned
       *   - default:   thin bars
       * We render one or the other so the layout collapses cleanly.
       */}
      {expanded ? (
        <div className="border-border bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 max-h-[70vh] w-56 origin-right overflow-y-auto rounded-md border py-1.5 shadow-md">
          {visibleHeadings.map((h) => {
            const isActive = h.id === activeId;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => jumpTo(h.id)}
                className={cn(
                  "block w-full truncate pr-3 py-1 text-left transition-colors",
                  LEVEL_INDENT[h.level],
                  LEVEL_TEXT_SIZE[h.level],
                  isActive
                    ? "text-foreground bg-accent/60 font-medium"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
                title={h.text || "Untitled heading"}
                aria-current={isActive ? "true" : undefined}
              >
                {h.text || "Untitled heading"}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          {visibleHeadings.map((h) => {
            const isActive = h.id === activeId;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => jumpTo(h.id)}
                aria-label={h.text || "Untitled heading"}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "h-[2px] rounded-full transition-colors",
                  LEVEL_BAR_WIDTH[h.level],
                  isActive
                    ? "bg-foreground"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            );
          })}
        </div>
      )}
    </nav>
  );
}
