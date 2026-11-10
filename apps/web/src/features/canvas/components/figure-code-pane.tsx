"use client";

import {
  detectDiagramType,
  figureTitle,
  parseDiagram,
} from "@octonote/octodraw";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { type DslTokenKind, highlightDsl } from "../lib/dsl-highlight";

/** Token colours from the design tokens' dark code palette (the one note code blocks use). */
const TOKEN_CLASS: Record<DslTokenKind, string> = {
  plain: "",
  comment: "text-code-comment italic",
  keyword: "text-code-keyword font-semibold",
  name: "text-code-title",
  operator: "text-code-keyword",
  punct: "text-code-foreground/55",
  attr: "text-code-attr",
  value: "text-code-string",
  number: "text-code-number",
  string: "text-code-string",
  label: "text-code-variable",
};

// Shared by the coloured layer and the textarea on top of it, so the caret lines up with the text.
const CODE_TEXT = "p-3 font-mono text-[13px] leading-relaxed whitespace-pre";

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
  const colored = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => highlightDsl(source), [source]);
  const title = figureTitle(source) ?? "Figure";
  // Only architecture diagrams and flowcharts use this parser; other kinds have their own.
  const problems = useMemo(() => {
    if (detectDiagramType(source) !== "flow") return [];
    return parseDiagram(source).diagnostics.filter(
      (d) => d.severity === "error",
    );
  }, [source]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      aria-label={`Code of ${title}`}
      className="bg-code-background text-code-foreground border-code-comment/25 absolute inset-y-0 right-0 z-30 flex w-[min(420px,100%)] flex-col border-l shadow-lg"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="border-code-comment/25 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-code-comment text-xs font-medium tracking-wide uppercase">
          Code
        </span>
        <span className="text-code-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close code"
          title="Close (Esc)"
          className="hover:bg-code-foreground/10 text-code-comment hover:text-code-foreground grid size-8 place-items-center rounded-md"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <pre
          ref={colored}
          aria-hidden="true"
          className={`${CODE_TEXT} pointer-events-none absolute inset-0 m-0 overflow-hidden`}
        >
          {lines.map((tokens, i) => (
            <span key={i}>
              {tokens.map((t, j) => (
                <span key={j} className={TOKEN_CLASS[t.kind]}>
                  {t.text}
                </span>
              ))}
              {"\n"}
            </span>
          ))}
          {/* Room for the textarea's last line and scrollbar. */}
          {" \n"}
        </pre>
        <textarea
          ref={ref}
          wrap="off"
          onScroll={(e) => {
            const pre = colored.current;
            if (!pre) return;
            pre.scrollTop = e.currentTarget.scrollTop;
            pre.scrollLeft = e.currentTarget.scrollLeft;
          }}
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
          className={`${CODE_TEXT} caret-code-foreground selection:bg-code-attr/30 absolute inset-0 resize-none overflow-auto bg-transparent text-transparent outline-none`}
        />
      </div>
      <footer className="text-code-comment border-code-comment/25 shrink-0 border-t px-3 py-2 text-xs">
        {problems.length ? (
          <p className="text-code-keyword">
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
