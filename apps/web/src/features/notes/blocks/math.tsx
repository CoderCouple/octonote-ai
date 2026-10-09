"use client";

/**
 * Math, rendered with KaTeX:
 *  - `mathBlock` — display equation (`$$…$$` / ```math in markdown)
 *  - `math` inline content — an equation inside a sentence (`$…$`)
 * Click to edit the LaTeX with a live preview (when the note is editable);
 * readers only see the rendered result. KaTeX runs with `trust: false`, so
 * LaTeX can't inject links or HTML on published pages.
 *
 * Markdown export writes ```math fences and `$…$` inline code, which the
 * paste importer (lib/markdown-import.ts) reads back as math.
 */
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
} from "@blocknote/react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Sigma } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function renderLatex(
  latex: string,
  displayMode: boolean,
): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(latex, {
        displayMode,
        throwOnError: true,
        trust: false,
        strict: "ignore",
      }),
      error: null,
    };
  } catch (err) {
    return {
      html: katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        trust: false,
        strict: "ignore",
      }),
      error:
        err instanceof Error
          ? err.message.replace(/^KaTeX parse error:\s*/, "")
          : String(err),
    };
  }
}

/* ───────────── Display equation block ───────────── */

export const MathBlock = createReactBlockSpec(
  {
    type: "mathBlock" as const,
    propSchema: { latex: { default: "" } },
    content: "none" as const,
  },
  {
    render: ({ block, editor }) => (
      <MathBlockView
        latex={block.props.latex}
        editable={editor.isEditable}
        onChange={(latex) => editor.updateBlock(block, { props: { latex } })}
      />
    ),
    toExternalHTML: ({ block }) => (
      <pre>
        <code className="language-math">{block.props.latex}</code>
      </pre>
    ),
  },
);

function MathBlockView({
  latex,
  editable,
  onChange,
}: {
  latex: string;
  editable: boolean;
  onChange: (latex: string) => void;
}) {
  const [editing, setEditing] = useState(editable && latex === "");
  const [draft, setDraft] = useState(latex);
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = editing ? draft : latex;
  const { html, error } = useMemo(
    () => renderLatex(shown || "\\;", true),
    [shown],
  );

  useEffect(() => setDraft(latex), [latex]);
  useEffect(() => {
    if (editing) area.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== latex) onChange(draft);
  };

  return (
    <div className="my-1 w-full" contentEditable={false}>
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => editable && setEditing(true)}
        onKeyDown={(e) => editable && e.key === "Enter" && setEditing(true)}
        aria-label={editable ? "Edit equation" : undefined}
        className={cn(
          "overflow-x-auto rounded-lg px-4 py-3 text-center",
          editable && "hover:bg-accent/60 cursor-pointer",
          editing && "bg-accent/60",
        )}
      >
        {latex || editing ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span className="text-foreground-subtle inline-flex items-center gap-2 text-sm">
            <Sigma className="size-4" /> Add an equation
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-2 rounded-lg border p-2">
          <textarea
            ref={area}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (
                e.key === "Escape" ||
                (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              ) {
                e.preventDefault();
                commit();
              }
            }}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            spellCheck={false}
            placeholder="e.g. x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
            className="w-full resize-none bg-transparent font-mono text-sm outline-none"
          />
          <p
            className={cn(
              "text-xs",
              error ? "text-destructive" : "text-foreground-subtle",
            )}
          >
            {error ?? "LaTeX · ⌘/Ctrl + Enter or click away to finish"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────── Inline equation ───────────── */

export const MathInline = createReactInlineContentSpec(
  {
    type: "math" as const,
    propSchema: { latex: { default: "" } },
    content: "none" as const,
  },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <MathInlineView
        latex={inlineContent.props.latex}
        editable={editor.isEditable}
        onChange={(latex) =>
          updateInlineContent({ type: "math", props: { latex } })
        }
      />
    ),
    toExternalHTML: ({ inlineContent }) => (
      <code>{`$${inlineContent.props.latex}$`}</code>
    ),
  },
);

function MathInlineView({
  latex,
  editable,
  onChange,
}: {
  latex: string;
  editable: boolean;
  onChange: (latex: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const { html, error } = useMemo(
    () => renderLatex(latex || "\\square", false),
    [latex],
  );
  const preview = useMemo(
    () => renderLatex(draft || "\\square", false),
    [draft],
  );

  useEffect(() => setDraft(latex), [latex]);

  const commit = () => {
    setEditing(false);
    if (draft !== latex) onChange(draft);
  };

  return (
    <span
      className="relative inline-block align-baseline"
      contentEditable={false}
    >
      <span
        role={editable ? "button" : undefined}
        onClick={() => editable && setEditing(true)}
        title={error ?? undefined}
        className={cn(
          "rounded px-0.5",
          editable && "hover:bg-accent cursor-pointer",
          error && "text-destructive",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {editing ? (
        <span className="bg-popover absolute top-full left-0 z-20 mt-1 flex w-72 flex-col gap-1.5 rounded-lg border p-2 shadow-md">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                commit();
              }
            }}
            spellCheck={false}
            placeholder="LaTeX, e.g. E = mc^2"
            className="bg-transparent font-mono text-sm outline-none"
          />
          {preview.error ? (
            <span className="text-destructive text-xs">{preview.error}</span>
          ) : (
            <span
              className="text-muted-foreground text-xs"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          )}
        </span>
      ) : null}
    </span>
  );
}
