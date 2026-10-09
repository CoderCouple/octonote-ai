"use client";

/**
 * The big title at the top of a note, editable in place like Notion: click
 * and type. Saves on a short debounce and on blur; an empty title is saved as
 * "Untitled". Enter leaves the title (titles are single-line).
 */
import { useEffect, useRef } from "react";

const SAVE_DELAY_MS = 600;
/** Same limit as the API (PageUpdateSchema.title). */
export const MAX_TITLE = 120;

export function NoteTitle({
  value,
  editable,
  onChange,
  onSave,
  onPasteBody,
}: {
  value: string;
  editable: boolean;
  /** Live updates (keeps the header title in sync while typing). */
  onChange: (next: string) => void;
  /** Persists the title. */
  onSave: (next: string) => void | Promise<void>;
  /**
   * Pasting several lines into the title: the first line becomes the title,
   * the rest is handed here to go into the note body (like Notion).
   */
  onPasteBody?: (markdown: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(value);

  // Grow with the text so long titles wrap instead of scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(
    () => () => void (timer.current && clearTimeout(timer.current)),
    [],
  );

  const flush = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const clean = next.trim().slice(0, MAX_TITLE) || "Untitled";
    if (clean === saved.current) return;
    saved.current = clean;
    void onSave(clean);
  };

  const style = { fontFamily: "var(--font-reader-family)" };
  const cls =
    "text-foreground-strong w-full resize-none overflow-hidden bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none placeholder:text-foreground-subtle md:text-4xl";

  if (!editable) {
    return (
      <h1 className={cls} style={style}>
        {value || "Untitled"}
      </h1>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value === "Untitled" ? "" : value}
      placeholder="Untitled"
      aria-label="Note title"
      spellCheck
      maxLength={MAX_TITLE}
      className={cls}
      style={style}
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, " ");
        onChange(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(next), SAVE_DELAY_MS);
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!text.includes("\n")) return; // single line: the browser pastes it (maxLength caps it)
        e.preventDefault();
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        const firstIdx = lines.findIndex((l) => l.trim() !== "");
        if (firstIdx === -1) return;
        // "# Heading" / "## Heading" → "Heading" for the title.
        const first = lines[firstIdx]!.replace(/^\s{0,3}#{1,6}\s+/, "").trim();
        const el = e.currentTarget;
        const before = el.value.slice(0, el.selectionStart ?? el.value.length);
        const after = el.value.slice(el.selectionEnd ?? el.value.length);
        const next = (before + first + after).slice(0, MAX_TITLE);
        onChange(next);
        flush(next);
        const rest = lines
          .slice(firstIdx + 1)
          .join("\n")
          .trim();
        if (rest) onPasteBody?.(rest);
      }}
      onBlur={(e) => flush(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
