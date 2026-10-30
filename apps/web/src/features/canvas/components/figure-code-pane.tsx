"use client";

import {
  detectDiagramType,
  figureTitle,
  parseDiagram,
} from "@octonote/octodraw";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

/**
 * A figure's code beside the canvas (the canvas's "Code" button). Typing
 * redraws the figure live; the element toolbar's edits show up here as they
 * happen, because both read and write the same canvas document.
 */
export function FigureCodePane({
  source,
  onChange,
  onClose,
}: {
  source: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const title = figureTitle(source) ?? "Figure";
  // Only architecture diagrams and flowcharts use this parser; other kinds have their own.
  const problems = useMemo(() => {
    if (detectDiagramType(source) !== "flow") return [];
    return parseDiagram(source).diagnostics.filter((d) => d.severity === "error");
  }, [source]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      aria-label={`Code of ${title}`}
      className="bg-background absolute inset-y-0 right-0 z-30 flex w-[min(420px,100%)] flex-col border-l shadow-lg"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Code
        </span>
        <span className="text-foreground-strong min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close code"
          title="Close (Esc)"
          className="hover:bg-accent text-muted-foreground grid size-8 place-items-center rounded-md"
        >
          <X className="size-4" />
        </button>
      </header>
      <textarea
        ref={ref}
        value={source}
        spellCheck={false}
        aria-label="Figure code"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Tab indents instead of leaving the editor.
          if (e.key !== "Tab" || e.shiftKey) return;
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: a, selectionEnd: b, value } = el;
          onChange(`${value.slice(0, a)}  ${value.slice(b)}`);
          requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
        }}
        className="text-foreground min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none"
      />
      <footer className="text-muted-foreground shrink-0 border-t px-3 py-2 text-xs">
        {problems.length ? (
          <p className="text-destructive">
            Line {problems[0]!.line}: {problems[0]!.message}
            {problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}
          </p>
        ) : (
          <p>The figure redraws as you type. ⌘Z undoes a whole edit.</p>
        )}
      </footer>
    </aside>
  );
}
