"use client";

/**
 * `interactive` block: an explorable widget, flashcards, practice questions, a
 * quiz, a mind map, matching, an animated scene or a sandboxed custom app,
 * drawn from a JSON spec by the @octonote/widgets, /interactive and /motion
 * libraries. In markdown it's a fence named after its kind (```quiz) holding
 * the JSON, so the CLI and assistants can write them.
 *
 * The spec is untrusted (pasted, or written by an agent): it's validated
 * before anything renders, and a broken one shows its problems instead of
 * white-screening the note. Custom apps only run after a click, in a
 * sandboxed iframe with no network. Editors can edit the JSON (only valid
 * JSON is saved) or ask the AI to change the block; readers just use it.
 */
import "@octonote/widgets/styles.css";
import "@octonote/interactive/styles.css";
import "@octonote/motion/styles.css";
import "@octonote/compose/styles.css";
import { createReactBlockSpec } from "@blocknote/react";
import { checkBlock, customEntry, defaultCatalog, type Issue } from "@octonote/compose";
import { BlockView } from "@octonote/compose/react";
import { defaultComponents, InteractiveProvider, webStorageStore } from "@octonote/interactive";
import { webWidgetStore, WidgetsProvider } from "@octonote/widgets";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Code2, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/api/client-fetch";

/** Every kind a note can embed, including sandboxed custom apps. */
export const notesCatalog = defaultCatalog.with(customEntry);

export const INTERACTIVE_LABELS: Record<string, string> = {
  widget: "Interactive widget",
  flashcards: "Flashcards",
  mcq: "Practice questions",
  quiz: "Quiz",
  mindmap: "Mind map",
  matching: "Matching",
  scene: "Animation",
  custom: "Custom app",
};

/** A starter spec for a kind: the catalog's example, which is tested to be valid. */
export function starterSpec(kind: string): string {
  const { kind: _kind, ...spec } = notesCatalog.get(kind)?.example ?? {};
  return JSON.stringify(spec);
}

// Progress (answers, known cards) stays in the reader's browser, per block.
const store = typeof window === "undefined" ? undefined : webStorageStore(window.localStorage, "octonote-block:");
// Each reader's widget settings (slider positions and the like), kept per block.
const widgetStore = typeof window === "undefined" ? undefined : webWidgetStore(window.localStorage, "octonote-widget:");

/** TeX in widget formula lines, typeset with KaTeX (trust off: no links, classes or styles from content). */
function renderMath(tex: string) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { throwOnError: false, trust: false, displayMode: false }) }} />;
}

export const InteractiveBlock = createReactBlockSpec(
  {
    type: "interactive" as const,
    propSchema: {
      kind: { default: "widget" },
      spec: { default: "" },
    },
    content: "none" as const,
  },
  {
    toExternalHTML: ({ block }) => (
      <pre>
        <code className={`language-${block.props.kind}`}>{block.props.spec}</code>
      </pre>
    ),
    render: ({ block, editor }) => (
      <InteractiveView
        id={block.id}
        kind={block.props.kind}
        spec={block.props.spec}
        editable={editor.isEditable}
        update={(props) => editor.updateBlock(block, { props })}
      />
    ),
  },
);

type Check = { ok: true; block: Parameters<typeof BlockView>[0]["block"] } | { ok: false; issues: Issue[] };

function check(kind: string, spec: string, id: string): Check {
  let value: unknown;
  try {
    value = JSON.parse(spec || "{}");
  } catch (error) {
    return { ok: false, issues: [{ path: "", message: `Not valid JSON: ${(error as Error).message}` }] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: [{ path: "", message: "The spec must be a JSON object" }] };
  const result = checkBlock(notesCatalog, { ...(value as object), kind }, id);
  return result.ok ? result : { ok: false, issues: result.issues };
}

function InteractiveView({
  id,
  kind,
  spec,
  editable,
  update,
}: {
  id: string;
  kind: string;
  spec: string;
  editable: boolean;
  update: (props: Partial<{ kind: string; spec: string }>) => void;
}) {
  const dark = useIsDark();
  const theme = dark ? "dark" : "light";
  const result = useMemo(() => check(kind, spec, id), [kind, spec, id]);
  const [mode, setMode] = useState<"view" | "json" | "ai">("view");
  const label = INTERACTIVE_LABELS[kind] ?? kind;

  return (
    <div
      className="my-1 w-full"
      contentEditable={false}
      // Keys typed inside the block (flashcard shortcuts, slider arrows, JSON) belong to it, not the editor.
      onKeyDown={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
    >
      <div className="group bg-card relative overflow-hidden rounded-xl border">
        {editable ? (
          <header className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="text-muted-foreground text-xs font-medium">{label}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setMode((m) => (m === "ai" ? "view" : "ai"))} aria-pressed={mode === "ai"}>
                <Sparkles className="size-3.5" />
                Ask AI
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setMode((m) => (m === "json" ? "view" : "json"))} aria-pressed={mode === "json"}>
                <Code2 className="size-3.5" />
                Edit JSON
              </Button>
            </div>
          </header>
        ) : null}

        {editable && mode === "ai" ? <AskAi kind={kind} spec={spec} disabled={!result.ok} onDone={(next) => (update({ spec: next }), setMode("view"))} /> : null}
        {editable && (mode === "json" || !result.ok) ? (
          <JsonEditor kind={kind} spec={spec} id={id} onSave={(next) => (update({ spec: next }), setMode("view"))} onCancel={result.ok ? () => setMode("view") : undefined} />
        ) : null}

        <div className="p-3">
          {result.ok ? (
            <InteractiveProvider components={defaultComponents} theme={theme} store={store}>
              <WidgetsProvider theme={theme} store={widgetStore} renderMath={renderMath}>
                <BlockView block={result.block} theme={theme} />
              </WidgetsProvider>
            </InteractiveProvider>
          ) : !editable ? (
            <p className="text-muted-foreground text-sm">This {label.toLowerCase()} couldn't be shown.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Edit the spec as JSON. Problems show as you type; only a valid spec can be saved. */
function JsonEditor({ kind, spec, id, onSave, onCancel }: { kind: string; spec: string; id: string; onSave: (spec: string) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState(() => pretty(spec));
  useEffect(() => setDraft(pretty(spec)), [spec]);
  const result = useMemo(() => check(kind, draft, id), [kind, draft, id]);
  return (
    <div className="border-b p-3">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        aria-label="Block JSON"
        className="bg-muted/40 h-64 w-full resize-y rounded-md border p-3 font-mono text-xs outline-none"
      />
      {result.ok ? null : (
        <ul className="text-destructive mt-2 max-h-28 list-disc overflow-auto pl-5 text-xs" role="alert">
          {result.issues.slice(0, 6).map((issue, i) => (
            <li key={i}>
              {issue.path ? <code>{issue.path}</code> : null} {issue.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button size="sm" disabled={!result.ok} onClick={() => onSave(JSON.stringify(JSON.parse(draft)))}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/** Ask the AI to change this block ("make it harder", "add two more cards"). */
function AskAi({ kind, spec, disabled, onDone }: { kind: string; spec: string; disabled: boolean; onDone: (spec: string) => void }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  async function submit() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi.post<{ kind: string; spec: Record<string, unknown> }>("/ai/blocks/edit", { kind, spec: JSON.parse(spec), instruction });
      onDone(JSON.stringify(result.spec));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI couldn't change this block.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2 border-b p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex gap-2">
        <input
          ref={input}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={disabled ? "Fix the JSON errors first" : "e.g. Make it harder, add a slider for years"}
          disabled={disabled || busy}
          aria-label="What should change?"
          className="bg-background flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
        />
        <Button type="submit" size="sm" disabled={disabled || busy || !instruction.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Change"}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </form>
  );
}

function pretty(spec: string): string {
  try {
    return JSON.stringify(JSON.parse(spec || "{}"), null, 2);
  } catch {
    return spec;
  }
}

function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
