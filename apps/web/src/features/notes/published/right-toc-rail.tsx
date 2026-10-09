/**
 * Notion-style vertical bar-stack scroll-spy pinned to the right of the
 * article. One horizontal bar per H1/H2/H3 heading; width encodes level
 * (H1 widest → H3 narrowest). The heading closest to the top of the
 * viewport wins the "active" state and renders as a bolder, wider bar.
 *
 * Hover the rail → it expands into a text menu of heading labels so
 * readers can click through. Clicking scrolls the window smoothly.
 *
 * Scroll-spy uses a window-scroll listener (rAF-throttled) rather than
 * IntersectionObserver because we want a single "closest to top" winner
 * — never zero-active, never flickering between adjacent sections.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionEntry } from "../lib/derive-published-meta";
import { cn } from "@/lib/utils";

interface RightTocRailProps {
  sections: SectionEntry[];
  footnote?: string;
}

const LEVEL_WIDTH: Record<1 | 2 | 3, string> = {
  1: "w-10",
  2: "w-7",
  3: "w-5",
};

const LEVEL_INDENT: Record<1 | 2 | 3, string> = {
  1: "pl-0",
  2: "pl-3",
  3: "pl-6",
};

const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: "text-[13px] font-medium",
  2: "text-xs",
  3: "text-xs",
};

export function RightTocRail({ sections, footnote }: RightTocRailProps) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );
  const [hovered, setHovered] = useState(false);
  const rafRef = useRef<number>(0);

  const ids = useMemo(() => sections.map((s) => s.id), [sections]);

  // Closest-to-top scroll-spy. Runs at most once per frame.
  const compute = useCallback(() => {
    let bestId: string | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`[data-id="${id}"]`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top - 96; // account for sticky offset
      if (top <= 0 && Math.abs(top) < bestDelta) {
        bestDelta = Math.abs(top);
        bestId = id;
      }
    }
    // If nothing has crossed yet, stick to the first heading so the rail
    // never renders a fully-empty active state.
    setActiveId(bestId ?? ids[0] ?? null);
    rafRef.current = 0;
  }, [ids]);

  useEffect(() => {
    if (ids.length === 0) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ids, compute]);

  const scrollTo = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    const el = document.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-fit self-start lg:flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Collapsed: vertical bar stack.
          Expanded (hover): text-labelled menu with the active row bolded. */}
      {hovered ? (
        <ul className="border-border/60 bg-background/95 flex flex-col gap-1.5 rounded border px-3 py-2 shadow-sm backdrop-blur">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={scrollTo(s.id)}
                className={cn(
                  "hover:text-foreground block leading-snug transition-colors",
                  LEVEL_INDENT[s.level],
                  LEVEL_TEXT[s.level],
                  s.id === activeId
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {s.text || "Untitled section"}
              </a>
            </li>
          ))}
          {footnote ? (
            <li className="text-muted-foreground/70 mt-2 max-w-[16rem] text-[11px] leading-relaxed">
              {footnote}
            </li>
          ) : null}
        </ul>
      ) : (
        <ul className="flex flex-col items-end gap-2 py-2 pr-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={scrollTo(s.id)}
                aria-label={s.text || "Section"}
                className={cn(
                  "block h-[3px] rounded-full transition-all",
                  s.id === activeId
                    ? "bg-foreground h-1 w-12"
                    : "bg-muted-foreground/50 hover:bg-muted-foreground",
                  s.id !== activeId && LEVEL_WIDTH[s.level],
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
