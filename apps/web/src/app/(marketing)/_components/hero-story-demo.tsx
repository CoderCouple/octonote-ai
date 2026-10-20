"use client";

/**
 * Hero animation: the whole product in one take, explaining the Transformer.
 * A cursor writes a note (with the attention equation), the canvas draws the
 * architecture — a rough stroke snapping clean via auto-shape — the shapes are
 * grouped into a figure and dragged into the note, then Publish flips the
 * window to the public reader page (byline, upvotes, views counting up).
 *
 * Pauses off screen; with reduced motion it shows the published page and never
 * moves. Phones get note + published page only (no canvas pane, no cursor).
 */
import "katex/dist/katex.min.css";
import katex from "katex";
import {
  ArrowBigUp,
  Columns2,
  Eye,
  FileText,
  FolderKanban,
  Globe,
  Group,
  LayoutGrid,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import { Typed } from "./demos/typed";

const EQUATION = String.raw`\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right)V`;

/** One beat each; `ms` is how long the beat lasts before the next one starts. */
const BEATS = [
  { id: "start", ms: 700 },
  { id: "title", ms: 1300 },
  { id: "para", ms: 2600 },
  { id: "equation", ms: 1400 },
  { id: "sketch", ms: 1400 }, // rough stroke draws
  { id: "snap", ms: 900 }, // auto-shape snaps it clean
  { id: "attention", ms: 1100 },
  { id: "stack", ms: 1300 },
  { id: "select", ms: 1100 },
  { id: "group", ms: 900 },
  { id: "drag", ms: 1600 },
  { id: "embed", ms: 1300 },
  { id: "publish", ms: 1100 },
  { id: "published", ms: 5200 },
] as const;
type BeatId = (typeof BEATS)[number]["id"];
const at = (id: BeatId) => BEATS.findIndex((b) => b.id === id);

/** Cursor waypoints (% of the stage) per beat; null hides it. */
const CURSOR: Record<BeatId, [number, number] | null> = {
  start: [30, 30],
  title: [24, 20],
  para: [34, 33],
  equation: [30, 50],
  sketch: [64, 33],
  snap: [70, 30],
  attention: [76, 52],
  stack: [74, 74],
  select: [93, 88],
  group: [74, 13],
  drag: [22, 76],
  embed: [30, 70],
  publish: [91, 4],
  published: null,
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function HeroStoryDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setTimeout(
      () => setBeat((b) => (b + 1) % BEATS.length),
      BEATS[beat]!.ms,
    );
    return () => clearTimeout(id);
  }, [beat, inView, reduced]);

  const b = reduced ? at("published") : beat;
  const past = (id: BeatId) => b >= at(id);
  const published = past("published");
  const cursor = CURSOR[BEATS[b]!.id];
  // Phones show one pane at a time, like the published reader's Note | Canvas
  // toggle: the canvas while it's being drawn, then the note the figure lands in.
  const phoneCanvas = past("sketch") && !past("drag");

  const equation = useMemo(
    () =>
      katex.renderToString(EQUATION, {
        displayMode: true,
        throwOnError: false,
      }),
    [],
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="bg-card text-card-foreground relative overflow-hidden rounded-2xl border text-left shadow-lg select-none"
    >
      {/* Window chrome: app header while editing, a browser bar once published */}
      <div className="relative flex h-12 items-center border-b px-4">
        <span className="flex gap-1.5">
          <span className="bg-window-close size-3 rounded-full" />
          <span className="bg-window-minimize size-3 rounded-full" />
          <span className="bg-window-zoom size-3 rounded-full" />
        </span>
        {published ? (
          <div className="bg-muted text-muted-foreground absolute left-1/2 flex w-[min(60%,420px)] -translate-x-1/2 items-center gap-2 truncate rounded-md px-3 py-1 text-xs">
            <Globe className="size-3.5 shrink-0" />
            octonote.ai/pub/the-transformer-in-one-page
          </div>
        ) : (
          <>
            <span className="text-foreground-strong ml-4 flex min-w-0 items-center gap-2 text-sm font-medium">
              <FolderKanban className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate max-sm:hidden">The Transformer</span>
            </span>
            <div className="bg-background absolute left-1/2 hidden -translate-x-1/2 overflow-hidden rounded-md border md:inline-flex">
              {([FileText, Columns2, LayoutGrid] as const).map((Icon, i) => (
                <span
                  key={i}
                  className={cn(
                    "grid size-8 place-items-center",
                    i > 0 && "border-l",
                    i === 1
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              ))}
            </div>
            <div className="bg-muted absolute left-1/2 inline-flex -translate-x-1/2 gap-0.5 rounded-md p-0.5 text-xs font-medium md:hidden">
              {(["Note", "Canvas"] as const).map((label) => (
                <span
                  key={label}
                  className={cn(
                    "rounded px-2.5 py-1 transition-colors duration-300",
                    (label === "Canvas") === phoneCanvas
                      ? "bg-background text-foreground-strong shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
            <span
              className={cn(
                "ml-auto rounded-md px-3 py-1 text-xs font-semibold transition-all duration-300",
                past("publish")
                  ? "bg-foreground-strong text-background scale-95"
                  : "border",
              )}
            >
              Publish
            </span>
          </>
        )}
      </div>

      <div className="relative h-[460px] md:h-[540px]">
        {/* ---------- Editing: note | canvas ---------- */}
        <div
          className={cn(
            "absolute inset-0 flex transition-all duration-700",
            published
              ? "pointer-events-none scale-[0.98] opacity-0"
              : "opacity-100",
          )}
        >
          {/* Note */}
          <div
            className={cn(
              "w-full overflow-hidden px-6 py-7 md:block md:w-1/2 md:border-r md:px-10",
              phoneCanvas && "hidden",
            )}
          >
            <h3 className="text-foreground-strong min-h-10 text-2xl font-bold tracking-tight md:text-3xl">
              <Typed
                text="The Transformer"
                active={past("title")}
                done={past("para")}
              />
            </h3>
            <p className="text-foreground mt-3 min-h-14 text-base md:text-lg">
              <Typed
                text="Every token decides how much to listen to every other token."
                active={past("para")}
                done={past("equation")}
              />
            </p>
            <div
              className={cn(
                "text-foreground-strong hide-scrollbar mt-1 overflow-x-auto text-[3.2vw] transition-all duration-500 sm:text-base [&_.katex-display]:my-3",
                past("equation")
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0",
              )}
              dangerouslySetInnerHTML={{ __html: equation }}
            />
            {/* Drop zone → embedded figure */}
            <div
              className={cn(
                "mt-2 rounded-xl transition-colors duration-300",
                BEATS[b]!.id === "drag" &&
                  "bg-accent/60 outline-foreground-subtle outline-2 outline-dashed",
              )}
            >
              {past("embed") ? (
                <div className="animate-word-rise overflow-hidden rounded-xl border">
                  <div className="bg-muted/40 grid h-32 place-items-center">
                    <TransformerDiagram
                      stage={4}
                      compact
                      className="h-28 w-full max-w-60"
                    />
                  </div>
                  <div className="flex items-center gap-2 border-t px-3 py-1.5 text-xs">
                    <Group className="text-muted-foreground size-3.5" />
                    <span className="font-medium">
                      Figure 1 · Transformer block
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-14" />
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            className={cn(
              "bg-muted/20 relative w-full md:block md:w-1/2",
              phoneCanvas ? "block" : "hidden",
            )}
          >
            <div className="grid h-full place-items-center p-6">
              <div className="relative">
                <div
                  className={cn(
                    "bg-popover absolute -top-11 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap shadow-md transition-opacity duration-300",
                    BEATS[b]!.id === "select" ? "opacity-100" : "opacity-0",
                  )}
                >
                  <Group className="size-3.5" /> Group as figure
                </div>
                <div
                  className={cn(
                    "rounded-xl border-2 p-3 transition-all duration-500",
                    BEATS[b]!.id === "select" &&
                      "border-foreground-subtle border-dashed",
                    past("group") &&
                      "border-foreground-strong bg-background/70 border-solid",
                    !past("select") && "border-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-1.5 text-xs font-medium transition-opacity duration-300",
                      past("group") ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <Group className="size-3.5" /> Transformer block
                    <span className="text-muted-foreground ml-auto font-normal">
                      ⠿
                    </span>
                  </div>
                  <TransformerDiagram
                    stage={
                      past("stack")
                        ? 4
                        : past("attention")
                          ? 3
                          : past("snap")
                            ? 2
                            : past("sketch")
                              ? 1
                              : 0
                    }
                    className="h-[340px] w-[240px] md:h-[360px] md:w-[260px] lg:h-[400px] lg:w-[290px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Drag chip rides with the cursor from the figure to the note */}
          <div
            className={cn(
              "bg-foreground-strong text-background pointer-events-none absolute z-20 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg transition-all duration-[1300ms] ease-in-out",
              BEATS[b]!.id === "drag"
                ? "top-[60%] left-[8%] opacity-100 md:top-[72%] md:left-[16%]"
                : "top-[92%] left-[40%] opacity-0 duration-0 md:top-[9%] md:left-[68%]",
            )}
          >
            ⧉ Transformer block
          </div>
        </div>

        {/* ---------- Published reader page ---------- */}
        <div
          className={cn(
            "absolute inset-0 overflow-hidden px-6 py-8 transition-all duration-700 md:px-0",
            published
              ? "opacity-100"
              : "pointer-events-none translate-y-2 opacity-0",
          )}
        >
          <div className="mx-auto max-w-2xl">
            <h3 className="text-foreground-strong text-3xl font-bold tracking-tight md:text-4xl">
              The Transformer
            </h3>
            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="bg-foreground-strong text-background grid size-6 place-items-center rounded-full text-[11px] font-semibold">
                S
              </span>
              <span className="text-foreground font-medium">Sunil Tiwari</span>
              <span>· Oct 13 · 3 min read</span>
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <ArrowBigUp className="size-4" />
                  <Counter to={48} run={published && !reduced} />
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="size-4" />
                  <Counter to={1284} run={published && !reduced} />
                </span>
              </span>
            </div>
            <p className="text-foreground mt-5 text-base md:text-lg">
              Every token decides how much to listen to every other token.
            </p>
            <div
              className="text-foreground-strong hide-scrollbar overflow-x-auto text-[3.2vw] sm:text-base [&_.katex-display]:my-3"
              dangerouslySetInnerHTML={{ __html: equation }}
            />
            <div className="overflow-hidden rounded-xl border">
              <div className="bg-muted/40 grid h-36 place-items-center md:h-44">
                <TransformerDiagram
                  stage={4}
                  compact
                  className="h-32 w-72 md:h-40 md:w-80"
                />
              </div>
              <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
                Figure 1 · Transformer block
              </div>
            </div>
          </div>
        </div>

        {/* Cursor */}
        {cursor && !reduced ? (
          <svg
            viewBox="0 0 24 24"
            className="text-foreground-strong pointer-events-none absolute z-30 hidden size-6 drop-shadow transition-all duration-700 ease-in-out md:block"
            style={{ left: `${cursor[0]}%`, top: `${cursor[1]}%` }}
          >
            <path
              d="M4 2l15 9.5-6.5 1.5L9 20z"
              fill="currentColor"
              stroke="var(--background)"
              strokeWidth="1.5"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

/** Counts up to `to` over ~1.6s once `run` turns true. */
function Counter({ to, run }: { to: number; run: boolean }) {
  const [n, setN] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) {
      setN(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1600);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, to]);
  return <>{n.toLocaleString("en-US")}</>;
}

/**
 * A Transformer encoder block drawn bottom-up.
 * stage 0 nothing · 1 rough sketch of the input box · 2 snapped clean ·
 * 3 + multi-head attention · 4 the full block.
 */
function TransformerDiagram({
  stage,
  compact,
  className,
}: {
  stage: 0 | 1 | 2 | 3 | 4;
  compact?: boolean;
  className?: string;
}) {
  const show = (on: boolean) =>
    cn("transition-opacity duration-500", on ? "opacity-100" : "opacity-0");
  const box = "fill-[var(--card)] stroke-current";
  return (
    <svg
      viewBox={compact ? "0 60 220 250" : "0 0 220 320"}
      className={cn("text-foreground", className)}
      fill="none"
      strokeWidth="1.5"
    >
      {/* Rough hand-drawn input box that auto-shape snaps clean */}
      <path
        d="M42 262c18-3 72-4 138 1 2 9 1 22-1 31-44 3-96 3-137 0-3-10-2-23 0-32z"
        stroke="currentColor"
        strokeDasharray="420"
        className={cn(
          "transition-all duration-[1200ms] ease-out",
          stage === 1
            ? "opacity-100 [stroke-dashoffset:0]"
            : "opacity-0 [stroke-dashoffset:420]",
        )}
      />
      <g className={show(stage >= 2)}>
        <rect x="40" y="262" width="140" height="32" rx="7" className={box} />
        <text
          x="110"
          y="282"
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
        >
          Embeddings + position
        </text>
      </g>

      <g className={show(stage >= 3)}>
        <path d="M110 262v-22m-4 5 4-5 4 5" stroke="currentColor" />
        <rect x="40" y="200" width="140" height="40" rx="7" className={box} />
        <text
          x="110"
          y="224"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
        >
          Multi-head attention
        </text>
        {/* Q K V */}
        {["Q", "K", "V"].map((q, i) => (
          <text
            key={q}
            x={78 + i * 32}
            y="252"
            textAnchor="middle"
            fontSize="9"
            fill="currentColor"
            opacity="0.6"
          >
            {q}
          </text>
        ))}
      </g>

      <g className={show(stage >= 4)}>
        <path d="M110 200v-14m-4 5 4-5 4 5" stroke="currentColor" />
        <rect
          x="40"
          y="160"
          width="140"
          height="26"
          rx="6"
          className={box}
          strokeDasharray="3 3"
        />
        <text
          x="110"
          y="177"
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
        >
          Add & norm
        </text>
        <path d="M110 160v-14m-4 5 4-5 4 5" stroke="currentColor" />
        <rect x="40" y="108" width="140" height="38" rx="7" className={box} />
        <text
          x="110"
          y="131"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
        >
          Feed-forward
        </text>
        <path d="M110 108v-14m-4 5 4-5 4 5" stroke="currentColor" />
        <rect
          x="40"
          y="68"
          width="140"
          height="26"
          rx="6"
          className={box}
          strokeDasharray="3 3"
        />
        <text
          x="110"
          y="85"
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
        >
          Add & norm
        </text>
        {/* Residual connections */}
        <path
          d="M40 278h-14v-104h14M180 220h14v-136h-14"
          stroke="currentColor"
          opacity="0.45"
        />
        <text
          x="207"
          y="160"
          fontSize="9"
          fill="currentColor"
          opacity="0.6"
          textAnchor="middle"
          transform="rotate(90 207 160)"
        >
          × N layers
        </text>
        {!compact ? (
          <>
            <path d="M110 68v-20m-4 5 4-5 4 5" stroke="currentColor" />
            <text
              x="110"
              y="38"
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
            >
              Contextual tokens
            </text>
          </>
        ) : null}
      </g>
    </svg>
  );
}
