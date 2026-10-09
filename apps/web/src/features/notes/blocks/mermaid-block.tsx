"use client";

/**
 * `mermaid` block: a diagram written as Mermaid text (```mermaid in
 * markdown), rendered to SVG. Ported from OctoFocus with two changes:
 *  - securityLevel "strict": diagram text can't inject HTML or click
 *    handlers — published notes render untrusted authors' diagrams.
 *  - Mermaid (large) loads on demand, only for notes that have a diagram.
 * Editors toggle to the source, resize, and open fullscreen; readers get the
 * diagram and fullscreen only.
 */
import { createReactBlockSpec } from "@blocknote/react";
import {
  Code2,
  GripHorizontal,
  GripVertical,
  Maximize2,
  Minimize2,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 1200;
/** 0 = fit the diagram's own height; a dragged size is stored in px. */
const DEFAULT_HEIGHT = 0;
/** Source editor height while the diagram is auto-sized. */
const SOURCE_HEIGHT = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 1600;

const DEFAULT_CODE = `flowchart LR
  A[Idea] --> B[Plan]
  B --> C{Ready?}
  C -->|Yes| D[Ship]
  C -->|No| B`;

type MermaidApi = typeof import("mermaid").default;
let mermaidPromise: Promise<MermaidApi> | null = null;
let configuredTheme: string | null = null;

/** Loads Mermaid once and (re)configures it for the current light/dark theme. */
async function getMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  const mermaid = await mermaidPromise;
  const theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "neutral";
  if (configuredTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      fontFamily: "inherit",
    });
    configuredTheme = theme;
  }
  return mermaid;
}

let renderSeq = 0;

export const MermaidBlock = createReactBlockSpec(
  {
    type: "mermaid" as const,
    propSchema: {
      code: { default: DEFAULT_CODE },
      height: { default: DEFAULT_HEIGHT },
      width: { default: 0 },
    },
    content: "none" as const,
  },
  {
    toExternalHTML: ({ block }) => (
      <pre>
        <code className="language-mermaid">{block.props.code}</code>
      </pre>
    ),
    render: ({ block, editor }) => (
      <MermaidView
        code={block.props.code}
        height={block.props.height}
        width={block.props.width}
        editable={editor.isEditable}
        update={(props) => editor.updateBlock(block, { props })}
      />
    ),
  },
);

function MermaidView({
  code,
  height,
  width,
  editable,
  update,
}: {
  code: string;
  height: number;
  width: number;
  editable: boolean;
  update: (
    props: Partial<{ code: string; height: number; width: number }>,
  ) => void;
}) {
  const [view, setView] = useState<"diagram" | "source">("diagram");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [live, setLive] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [draft, setDraft] = useState(code);
  const dark = useIsDark();

  useEffect(() => setDraft(code), [code]);

  useEffect(() => {
    if (view !== "diagram") return;
    let cancelled = false;
    void getMermaid()
      .then((mermaid) => mermaid.render(`mermaid-${++renderSeq}`, code))
      .then(({ svg }) => {
        if (cancelled) return;
        setSvg(svg);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, view, dark]);

  const h = live?.height ?? height;
  const w = live?.width ?? width;
  const body = useRef<HTMLDivElement>(null);
  /** Fixed height when resized or fullscreen; otherwise the diagram's natural size. */
  const fixed = fullscreen || h > 0;

  function startResize(
    direction: "horizontal" | "vertical" | "both",
    event: React.MouseEvent,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = w > 0 ? w : 0;
    let finalW = startW;
    // An auto-sized diagram starts resizing from its current rendered height.
    const startH = h > 0 ? h : (body.current?.offsetHeight ?? SOURCE_HEIGHT);
    let finalH = startH;
    const onMove = (ev: MouseEvent) => {
      if (direction !== "vertical") {
        finalW = Math.max(
          MIN_WIDTH,
          Math.min(
            MAX_WIDTH,
            (startW > 0 ? startW : 600) + (ev.clientX - startX),
          ),
        );
      }
      if (direction !== "horizontal") {
        finalH = Math.max(
          MIN_HEIGHT,
          Math.min(MAX_HEIGHT, startH + (ev.clientY - startY)),
        );
      }
      setLive({ width: finalW, height: finalH });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      setLive(null);
      update({
        ...(direction !== "vertical" ? { width: finalW } : {}),
        ...(direction !== "horizontal" ? { height: finalH } : {}),
      });
    };
    document.body.style.cursor =
      direction === "horizontal"
        ? "ew-resize"
        : direction === "vertical"
          ? "ns-resize"
          : "nwse-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const card = (
    <div
      className="bg-card group relative w-full max-w-full overflow-hidden rounded-xl border"
      style={{
        maxWidth: "100%",
        ...(!fullscreen && w > 0 ? { width: w } : {}),
      }}
    >
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-foreground-strong flex items-center gap-2 text-sm font-medium">
          <Workflow className="size-4" />
          Diagram
        </div>
        <div className="flex items-center gap-1">
          {editable ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => {
                if (view === "source" && draft !== code)
                  update({ code: draft });
                setView((v) => (v === "diagram" ? "source" : "diagram"));
              }}
              title={
                view === "diagram" ? "Edit Mermaid source" : "Show diagram"
              }
              aria-label={
                view === "diagram" ? "Edit Mermaid source" : "Show diagram"
              }
            >
              <Code2 className="size-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
        </div>
      </header>
      <div
        ref={body}
        className="relative overflow-hidden"
        style={{
          height: fullscreen
            ? "70vh"
            : h > 0
              ? h
              : editable && view === "source"
                ? SOURCE_HEIGHT
                : undefined,
        }}
      >
        {!editable || view === "diagram" ? (
          error ? (
            <pre className="text-destructive h-full overflow-auto p-4 text-xs whitespace-pre-wrap">
              {error}
            </pre>
          ) : svg ? (
            <div
              className={
                fixed
                  ? // Scale the whole diagram into the chosen box instead of cropping it.
                    "h-full p-4 [&>svg]:mx-auto [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  : "overflow-x-auto p-4 [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              }
              // Mermaid output in strict mode is sanitised (DOMPurify) before it gets here.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="text-muted-foreground p-6 text-sm">
              Rendering diagram…
            </div>
          )
        ) : (
          <textarea
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== code && update({ code: draft })}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm outline-none"
          />
        )}
      </div>
      {!fullscreen && editable ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => startResize("horizontal", e)}
            className="hover:bg-accent absolute top-11 right-0 bottom-3 flex w-2 cursor-ew-resize items-center justify-center border-l opacity-0 transition-opacity group-hover:opacity-100"
            title="Drag to resize width"
          >
            <GripVertical className="text-muted-foreground size-3" />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={(e) => startResize("vertical", e)}
            className="hover:bg-accent absolute right-3 bottom-0 left-0 flex h-2 cursor-ns-resize items-center justify-center border-t opacity-0 transition-opacity group-hover:opacity-100"
            title="Drag to resize height"
          >
            <GripHorizontal className="text-muted-foreground size-3" />
          </div>
          <div
            role="separator"
            aria-label="Resize"
            onMouseDown={(e) => startResize("both", e)}
            className="hover:bg-accent absolute right-0 bottom-0 grid size-3 cursor-nwse-resize place-items-center opacity-0 transition-opacity group-hover:opacity-100"
            title="Drag to resize"
          >
            <span className="text-muted-foreground text-[10px] leading-none">
              ⤡
            </span>
          </div>
        </>
      ) : null}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="bg-background/80 fixed inset-0 z-50 grid place-items-center p-6 backdrop-blur-sm"
        onClick={() => setFullscreen(false)}
        contentEditable={false}
      >
        <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
          {card}
        </div>
      </div>
    );
  }
  return (
    <div className="my-1 w-full" contentEditable={false}>
      {card}
    </div>
  );
}

/** Re-renders diagrams when the app switches between light and dark. */
function useIsDark() {
  const [dark, setDark] = useState(false);
  const ref = useRef<MutationObserver | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    ref.current = new MutationObserver(sync);
    ref.current.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => ref.current?.disconnect();
  }, []);
  return dark;
}
