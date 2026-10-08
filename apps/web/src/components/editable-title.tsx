"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface EditableTitleProps {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  /** Visual size — `lg` for project headers, `md` for note/canvas headers. */
  size?: "md" | "lg";
  /** Placeholder while empty (e.g. "Untitled"). */
  placeholder?: string;
  className?: string;
}

/**
 * Click-to-edit title. Renders as a span by default; clicking turns it
 * into a borderless input that auto-grows with the text. Enter or blur
 * commits the change (no-op if the title didn't change). Escape reverts.
 *
 * Used in the project split-view header and the focus note/canvas
 * headers so the user can rename a freshly-created "Untitled" resource
 * inline without opening a dialog.
 */
export function EditableTitle({
  value,
  onSave,
  size = "md",
  placeholder = "Untitled",
  className,
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    void onSave(next);
  };

  const sizeCls =
    size === "lg" ? "text-base font-semibold" : "text-sm font-semibold";

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={cn(
          "bg-transparent outline-none focus:outline-none",
          sizeCls,
          "min-w-[6ch]",
          className,
        )}
        style={{ width: `${Math.max(draft.length + 1, 6)}ch` }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "hover:bg-accent -mx-1 rounded px-1 text-left transition-colors",
        sizeCls,
        !value && "text-muted-foreground italic",
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}
