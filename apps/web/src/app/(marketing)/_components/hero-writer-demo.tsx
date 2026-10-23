"use client";

/**
 * Hero animation: one project (a note beside its canvas) written three ways.
 *   You         — a cursor types the note, ticks requirements, sketches a box
 *                 that snaps clean, then builds the diagram box by box.
 *   Claude Code — one prompt in a terminal; the note and diagram appear and the
 *                 project is published.
 *   Codex       — edits the same project: a Caching section in the note and a
 *                 Redis box on the canvas.
 * Tabs pick a scene; until someone does, they play in turn. Starts on the
 * finished Claude frame (server render, reduced motion), pauses off screen.
 * Note / Split / Canvas works like the app's switcher (the scene keeps going).
 * Phones stack the note over the canvas and dock the terminal at the top.
 */
import { Check, Globe } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

type Who = "you" | "claude" | "codex";
type Block = "title" | "intro" | "reqH" | "r1" | "r2" | "r3" | "math" | "code" | "cacheH" | "cache";
type NodeId = "client" | "lb" | "api" | "db" | "redis";
type EdgeId = "e1" | "e2" | "e3" | "e4";
type Line = { kind: "prompt"; text: string } | { kind: "cmd"; text: string } | { kind: "ok"; strong: string; rest: string };

interface Frame {
  typed: { title?: string; intro?: string };
  shown: Block[];
  ticked: ("r1" | "r2")[];
  nodes: NodeId[];
  edges: EdgeId[];
  flash: (Block | NodeId)[];
  term: { name: string; lines: Line[] } | null;
  /** The terminal closes once the agent is done; its lines stay so it fades out whole. */
  termOpen: boolean;
  status: "editing" | "saved" | "published";
  badge: string | null;
  cursor: { x: number; y: number } | null;
  sketch: { x: number; y: number; w: number; h: number } | null;
}

const TITLE = "How a URL shortener works";
const INTRO = "Turn a long link into a short code, then send anyone who opens it to the right page in milliseconds.";
const DRAFT: Block[] = ["title", "intro", "reqH", "r1", "r2", "r3", "math", "code"];

const NODES: { id: NodeId; label: string; sub?: string; x: number; y: number; shape?: "pill" | "db" }[] = [
  { id: "client", label: "Browser", x: 46, y: 12, shape: "pill" },
  { id: "lb", label: "Load balancer", x: 46, y: 34 },
  { id: "api", label: "API service", sub: "shorten · redirect", x: 46, y: 57 },
  { id: "db", label: "Postgres", sub: "code → URL", x: 72, y: 84, shape: "db" },
  { id: "redis", label: "Redis cache", sub: "hot codes", x: 22, y: 84, shape: "db" },
];
const EDGES: { id: EdgeId; from: NodeId; to: NodeId; label?: string }[] = [
  { id: "e1", from: "client", to: "lb" },
  { id: "e2", from: "lb", to: "api" },
  { id: "e3", from: "api", to: "db", label: "miss" },
  { id: "e4", from: "api", to: "redis", label: "get code" },
];

const TABS: { id: Who; label: string; kind: string; caption: string }[] = [
  { id: "you", label: "You", kind: "editor", caption: "You type the note and draw the diagram. Octonote saves as you go." },
  { id: "claude", label: "Claude Code", kind: "CLI", caption: "Claude Code writes the note, draws the diagram and publishes it, from one prompt." },
  { id: "codex", label: "Codex", kind: "CLI", caption: "Codex edits the same project: a new section in the note, a new box on the canvas." },
];
const ORDER: Who[] = ["you", "claude", "codex"];

const EMPTY: Frame = { typed: {}, shown: [], ticked: [], nodes: [], edges: [], flash: [], term: null, termOpen: false, status: "saved", badge: null, cursor: null, sketch: null };
const DRAFTED: Frame = { ...EMPTY, typed: { title: TITLE, intro: INTRO }, shown: DRAFT, ticked: ["r1", "r2"], nodes: ["client", "lb", "api", "db"], edges: ["e1", "e2", "e3"], status: "published" };
const FULL: Frame = { ...DRAFTED, shown: [...DRAFT, "cacheH", "cache"], nodes: [...DRAFTED.nodes, "redis"], edges: [...DRAFTED.edges, "e4"] };
/** What each scene ends on (and what reduced motion shows). */
const END: Record<Who, Frame> = {
  you: { ...DRAFTED, status: "saved" },
  claude: { ...DRAFTED, badge: "Written by Claude Code" },
  codex: { ...FULL, badge: "Edited by Codex" },
};

class Stale extends Error {}

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

export function HeroWriterDemo() {
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const [who, setWho] = useState<Who>("claude");
  const [frame, setFrame] = useState<Frame>(END.claude);
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState<"note" | "split" | "canvas">("split");
  const [edges, setEdges] = useState<{ id: EdgeId; d: string; head: string; lx: number; ly: number; w: number; h: number }[]>([]);

  const stage = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const term = useRef<HTMLDivElement>(null);
  const blocks = useRef<Partial<Record<Block, HTMLElement | null>>>({});
  const nodes = useRef<Partial<Record<NodeId, HTMLElement | null>>>({});
  const run = useRef(0);

  // Edges follow the boxes' real positions, so they fit any width.
  const measure = useCallback(() => {
    const c = canvas.current?.getBoundingClientRect();
    if (!c) return;
    setEdges(
      EDGES.flatMap((e) => {
        const a = nodes.current[e.from]?.getBoundingClientRect();
        const b = nodes.current[e.to]?.getBoundingClientRect();
        if (!a || !b) return [];
        const sx = a.left + a.width / 2 - c.left, sy = a.bottom - c.top;
        const tx = b.left + b.width / 2 - c.left, ty = b.top - c.top - 3;
        const my = (sy + ty) / 2;
        const d = Math.abs(sx - tx) < 2 ? `M${sx},${sy} V${ty}` : `M${sx},${sy} V${my} H${tx} V${ty}`;
        return [{ id: e.id, d, head: `M${tx - 5},${ty - 7} L${tx},${ty} L${tx + 5},${ty - 7} Z`, lx: (sx + tx) / 2 + (tx > sx ? 18 : -18), ly: my, w: c.width, h: c.height }];
      }),
    );
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [measure]);

  const play = useCallback(
    async (scene: Who, keepAuto: boolean) => {
      const r = ++run.current;
      setWho(scene);
      if (reduced) {
        setFrame(END[scene]);
        return;
      }
      const sleep = (ms: number) =>
        new Promise<void>((ok, no) => setTimeout(() => (r === run.current ? ok() : no(new Stale())), ms));
      const set = (p: Partial<Frame> | ((f: Frame) => Partial<Frame>)) =>
        setFrame((f) => ({ ...f, ...(typeof p === "function" ? p(f) : p) }));
      const show = (...b: Block[]) => set((f) => ({ shown: [...f.shown, ...b] }));
      const add = <K extends "nodes" | "edges" | "flash" | "ticked">(k: K, v: Frame[K][number]) =>
        set((f) => ({ [k]: [...(f[k] as unknown[]), v] }) as Partial<Frame>);
      const box = (el: Element | null | undefined) => {
        const s = stage.current?.getBoundingClientRect();
        const b = el?.getBoundingClientRect();
        return s && b ? { x: b.left - s.left, y: b.top - s.top, w: b.width, h: b.height } : null;
      };
      const point = (el: Element | null | undefined, fx = 0.5, fy = 0.5) => {
        const b = box(el);
        if (b) set({ cursor: { x: b.x + b.w * fx, y: b.y + b.h * fy } });
      };
      const type = async (k: "title" | "intro", text: string, ms: number) => {
        show(k);
        for (let i = 1; i <= text.length; i++) {
          set((f) => ({ typed: { ...f.typed, [k]: text.slice(0, i) } }));
          await sleep(ms);
        }
      };
      const line = async (l: Line, wait = 450) => {
        set((f) => ({ term: f.term && { ...f.term, lines: [...f.term.lines, l] } }));
        await sleep(wait);
      };
      const prompt = async (name: string, text: string) => {
        set({ term: { name, lines: [{ kind: "prompt", text: "" }] }, termOpen: true });
        await sleep(400);
        for (let i = 1; i <= text.length; i++) {
          set((f) => ({ term: f.term && { ...f.term, lines: [{ kind: "prompt", text: text.slice(0, i) }] } }));
          await sleep(22);
        }
        await sleep(350);
      };

      try {
        note.current?.scrollTo({ top: 0 });
        if (scene === "you") {
          setFrame({ ...EMPTY, status: "editing" });
          await sleep(50);
          point(blocks.current.title, 0.02, 0.4);
          await sleep(600);
          await type("title", TITLE, 45);
          point(blocks.current.intro, 0.02, 0.3);
          await type("intro", INTRO, 16);
          for (const b of ["reqH", "r1", "r2", "r3"] as const) {
            show(b);
            await sleep(260);
          }
          for (const t of ["r1", "r2"] as const) {
            point(blocks.current[t], 0.01, 0.5);
            await sleep(480);
            add("ticked", t);
          }
          point(blocks.current.math);
          show("math");
          await sleep(700);
          show("code");
          set({ status: "saved" });
          await sleep(500);
          // A rough box, dragged out by hand, snaps into the Browser shape.
          const b = box(nodes.current.client);
          if (b) {
            set({ cursor: { x: b.x, y: b.y } });
            await sleep(800);
            set({ sketch: { x: b.x, y: b.y, w: 0, h: 0 } });
            await sleep(30);
            set({ sketch: { ...b }, cursor: { x: b.x + b.w, y: b.y + b.h } });
            await sleep(900);
          }
          set({ sketch: null });
          add("nodes", "client");
          await sleep(400);
          for (const [n, e] of [["lb", "e1"], ["api", "e2"], ["db", "e3"]] as const) {
            point(nodes.current[n], 0.6, 0.6);
            await sleep(650);
            add("nodes", n);
            await sleep(200);
            add("edges", e);
            await sleep(450);
          }
          set({ cursor: null });
          await sleep(2400);
        } else if (scene === "claude") {
          setFrame({ ...EMPTY });
          await prompt("claude", "Explain how a URL shortener works, with an architecture diagram. Publish it.");
          await line({ kind: "cmd", text: 'octonote project create "How a URL shortener works" \\\n    --note shortener.md --canvas-mermaid arch.mmd --publish' }, 500);
          set({ typed: { title: TITLE, intro: INTRO } });
          for (const b of DRAFT) {
            show(b);
            await sleep(110);
          }
          set({ ticked: ["r1", "r2"] });
          for (const [n, e] of [["client"], ["lb", "e1"], ["api", "e2"], ["db", "e3"]] as const) {
            add("nodes", n);
            if (e) add("edges", e);
            await sleep(230);
          }
          await sleep(300);
          await line({ kind: "ok", strong: "✓ Published", rest: "octonote.ai/pub/how-a-url-shortener-works" }, 200);
          set({ status: "published", badge: "Written by Claude Code" });
          await sleep(1800);
          set({ termOpen: false });
          await sleep(2600);
        } else {
          setFrame({ ...DRAFTED });
          await prompt("codex", "Add a Redis cache to the diagram and a caching section to the note.");
          await line({ kind: "cmd", text: "octonote note append pag_4k2… --file caching.md" }, 350);
          for (const b of ["cacheH", "cache"] as const) {
            show(b);
            add("flash", b);
            await sleep(200);
          }
          await sleep(500);
          await line({ kind: "cmd", text: "octonote canvas redraw cnv_9x1… --from-mermaid arch.mmd" }, 350);
          add("nodes", "redis");
          add("flash", "redis");
          await sleep(250);
          add("edges", "e4");
          await sleep(600);
          await line({ kind: "ok", strong: "✓ Updated.", rest: "The published page shows it now." }, 200);
          set({ badge: "Edited by Codex" });
          await sleep(1200);
          set({ flash: [], termOpen: false });
          await sleep(2600);
        }
        if (keepAuto) play(ORDER[(ORDER.indexOf(scene) + 1) % ORDER.length], true);
      } catch (e) {
        if (!(e instanceof Stale)) throw e;
      }
    },
    [reduced],
  );

  // Play while on screen; stop (and later restart the scene) when scrolled away.
  useEffect(() => {
    if (!inView) {
      run.current++;
      return;
    }
    play(auto ? (who === "claude" && frame === END.claude ? "you" : who) : who, auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced]);

  // Like the editor: keep Codex's new section in view, above the terminal.
  useEffect(() => {
    const el = blocks.current.cache;
    const n = note.current;
    if (!el || !n || !frame.shown.includes("cache")) return;
    const nr = n.getBoundingClientRect(), er = el.getBoundingClientRect(), t = term.current?.getBoundingClientRect();
    const covers = frame.termOpen && t && t.top > nr.top + 80 && t.top < nr.bottom;
    const limit = (covers ? t.top : nr.bottom) - 14;
    if (er.bottom > limit) n.scrollTo({ top: n.scrollTop + er.bottom - limit, behavior: reduced ? "auto" : "smooth" });
  }, [frame.shown, frame.term, frame.termOpen, reduced]);

  const pick = (w: Who) => {
    setAuto(false);
    play(w, false);
  };

  const on = (b: Block) => frame.shown.includes(b);
  const blk = (b: Block, className?: string) => ({
    ref: (el: HTMLElement | null) => {
      blocks.current[b] = el;
    },
    className: cn(
      "ease-emphasized rounded-md transition-[opacity,transform,background-color,box-shadow] duration-500",
      on(b) ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
      frame.flash.includes(b) && "bg-muted shadow-[0_0_0_6px_var(--color-muted)]",
      className,
    ),
  });
  const caret = (k: "title" | "intro", full: string) =>
    frame.cursor && on(k) && (frame.typed[k]?.length ?? 0) < full.length ? (
      <span className="bg-foreground-strong ml-px inline-block h-[1em] w-0.5 translate-y-[2px] animate-pulse" />
    ) : null;
  const caption = TABS.find((t) => t.id === who)?.caption;

  return (
    <div ref={viewRef} className="text-center">
      <div role="tablist" aria-label="Who is writing" className="bg-muted inline-flex gap-1 rounded-xl border p-1">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={who === t.id}
            tabIndex={who === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!d) return;
              const next = TABS[(i + d + TABS.length) % TABS.length]!;
              pick(next.id);
              (e.currentTarget.parentElement?.children[TABS.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors md:px-4 md:py-2.5",
              who === t.id ? "bg-card text-foreground-strong shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="hidden rounded border px-1.5 font-mono text-[11px] font-medium sm:inline">{t.kind}</span>
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-3 min-h-[1.5em] text-sm" aria-live="polite">
        {caption}
      </p>

      <div
        ref={stage}
        className="bg-card text-card-foreground relative mt-6 overflow-hidden rounded-2xl border text-left shadow-lg select-none"
      >
        {/* Window bar: breadcrumb · view switcher · save state */}
        <div className="flex h-11 items-center gap-3 border-b px-4 text-sm">
          <span className="flex shrink-0 gap-1.5">
            <span className="bg-window-close size-3 rounded-full" />
            <span className="bg-window-minimize size-3 rounded-full" />
            <span className="bg-window-zoom size-3 rounded-full" />
          </span>
          <span aria-hidden className="text-muted-foreground ml-2 hidden min-w-0 truncate sm:inline">
            Projects / <span className="text-foreground-strong font-medium">{TITLE}</span>
          </span>
          <span role="group" aria-label="View" className="bg-muted inline-flex shrink-0 gap-0.5 rounded-md border p-0.5 text-xs font-medium sm:mx-auto">
            {(["note", "split", "canvas"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 capitalize transition-colors",
                  view === v ? "bg-card text-foreground-strong shadow-sm" : "text-muted-foreground hover:text-foreground-strong",
                )}
              >
                {v}
              </button>
            ))}
          </span>
          <span
            aria-hidden
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 text-xs md:ml-0",
              frame.status === "published" ? "text-foreground-strong" : "text-muted-foreground",
            )}
          >
            {frame.status === "published" ? <Globe className="size-3.5" /> : <span className="bg-foreground-subtle size-1.5 rounded-full" />}
            {frame.status === "published" ? (
              <>
                Published<span className="hidden lg:inline"> · octonote.ai/pub/…</span>
              </>
            ) : frame.status === "editing" ? (
              "Editing"
            ) : (
              "Saved"
            )}
          </span>
          <span aria-hidden className="text-foreground-strong hidden shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold md:inline">Share</span>
        </div>

        <div aria-hidden className={cn("grid md:h-[500px]", view === "split" && "md:grid-cols-[1fr_1.15fr]")}>
          {/* Note */}
          <div ref={note} className={cn(
              "relative overflow-hidden px-5",
              view === "canvas" && "hidden",
              view === "split" ? "h-[330px] border-b md:h-auto md:border-r md:border-b-0" : "h-[460px] md:h-auto",
              view === "note" && "md:px-[max(2rem,calc(50%-22rem))]",
            )}
            >
            <div className="pt-5 pb-56 text-[13px] md:px-3 md:pt-8 md:text-sm">
            <h3 {...blk("title", "text-foreground-strong min-h-[1.3em] text-xl font-bold tracking-tight md:text-2xl")}>
              {frame.typed.title}
              {caret("title", TITLE)}
            </h3>
            <p {...blk("intro", "text-foreground mt-2 min-h-[1.6em] leading-relaxed")}>
              {frame.typed.intro}
              {caret("intro", INTRO)}
            </p>
            <h4 {...blk("reqH", "text-foreground-strong mt-4 text-[15px] font-bold")}>Requirements</h4>
            <ul className="mt-1.5 space-y-1">
              {(
                [
                  ["r1", "Shorten any URL to a 7-character code"],
                  ["r2", "Redirect in under 50 ms"],
                  ["r3", "100M new links a day"],
                ] as const
              ).map(([k, text]) => (
                <li key={k} {...blk(k, "text-foreground flex items-center gap-2")}>
                  <span
                    className={cn(
                      "grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors",
                      k !== "r3" && frame.ticked.includes(k) ? "bg-foreground-strong border-foreground-strong text-background" : "border-muted-foreground",
                    )}
                  >
                    {k !== "r3" && frame.ticked.includes(k) ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <div {...blk("math", "bg-muted text-foreground-strong mt-3 py-2.5 text-center font-serif text-[15px] italic")}>
              100M ÷ 86,400 s ≈ <span className="font-sans text-[13.5px] font-bold not-italic">1,160 writes/s</span>
            </div>
            <pre {...blk("code", "bg-terminal text-terminal-foreground mt-3 hidden overflow-hidden px-3.5 py-2.5 font-mono text-xs leading-relaxed md:block")}>
              <span className="text-terminal-muted">GET</span> /x7Kp2Qa{"\n"}
              <span className="text-terminal-muted">301</span> Location: https://example.com/a/very/long/path
            </pre>
            <h4 {...blk("cacheH", "text-foreground-strong mt-4 text-[15px] font-bold")}>Caching</h4>
            <p {...blk("cache", "text-foreground mt-1.5 leading-relaxed")}>
              Hot codes live in Redis, so 9 in 10 redirects never touch the database.
            </p>
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvas}
            className={cn(
              "bg-card relative overflow-hidden",
              view === "note" && "hidden",
              view === "split" ? "h-[300px] md:h-auto" : "h-[460px] md:h-auto",
            )}
            style={{ backgroundImage: "radial-gradient(var(--color-border) 1.2px, transparent 1.2px)", backgroundSize: "20px 20px" }}
          >
            <svg className="absolute inset-0 size-full overflow-visible" viewBox={edges[0] ? `0 0 ${edges[0].w} ${edges[0].h}` : undefined}>
              {edges.map((e) => {
                const shown = frame.edges.includes(e.id);
                return (
                  <g key={e.id} className="text-muted-foreground">
                    <path
                      d={e.d}
                      pathLength={1}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeDasharray={1}
                      strokeDashoffset={shown ? 0 : 1}
                      className="transition-[stroke-dashoffset] duration-600 ease-out"
                    />
                    <path d={e.head} fill="currentColor" className={cn("transition-opacity delay-500 duration-200", shown ? "opacity-100" : "opacity-0")} />
                  </g>
                );
              })}
            </svg>
            {edges.map((e) => {
              const label = EDGES.find((x) => x.id === e.id)?.label;
              return label ? (
                <span
                  key={e.id}
                  className={cn(
                    "bg-card text-muted-foreground absolute -translate-x-1/2 -translate-y-1/2 rounded px-1.5 text-[11px] whitespace-nowrap transition-opacity delay-300 duration-300",
                    frame.edges.includes(e.id) ? "opacity-100" : "opacity-0",
                  )}
                  style={{ left: e.lx, top: e.ly }}
                >
                  {label}
                </span>
              ) : null;
            })}
            {NODES.map((n) => {
              const shown = frame.nodes.includes(n.id);
              return (
                <div
                  key={n.id}
                  ref={(el) => {
                    nodes.current[n.id] = el;
                  }}
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                  className={cn(
                    "border-foreground-strong bg-card text-foreground-strong absolute min-w-[104px] -translate-x-1/2 -translate-y-1/2 border-[1.6px] px-2.5 py-2 text-center text-xs font-semibold whitespace-nowrap transition-[opacity,scale,box-shadow] duration-300 md:min-w-[132px] md:px-3.5 md:py-2.5 md:text-[13px]",
                    n.shape === "pill" ? "rounded-full" : n.shape === "db" ? "rounded-[10px_10px_18px_18px/10px_10px_12px_12px]" : "rounded-[10px]",
                    shown ? "scale-100 opacity-100" : "scale-[0.85] opacity-0",
                    frame.flash.includes(n.id) && "shadow-[0_0_0_6px_var(--color-muted),0_0_0_7px_var(--color-border)]",
                  )}
                >
                  {n.label}
                  {n.sub ? <small className="text-muted-foreground block text-[11px] font-medium">{n.sub}</small> : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Hand-drawn box that snaps clean */}
        {frame.sketch ? (
          <div
            className="border-muted-foreground pointer-events-none absolute rounded border-[1.6px] border-dashed transition-[width,height] duration-800 ease-out"
            style={{ left: frame.sketch.x, top: frame.sketch.y, width: frame.sketch.w, height: frame.sketch.h }}
          />
        ) : null}

        {/* Cursor */}
        <div
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-10 transition-[transform,opacity] duration-700 ease-[cubic-bezier(.45,.05,.25,1)]",
            frame.cursor ? "opacity-100" : "opacity-0",
          )}
          style={frame.cursor ? { transform: `translate(${frame.cursor.x}px, ${frame.cursor.y}px)` } : undefined}
        >
          <svg viewBox="0 0 24 24" className="size-[18px] drop-shadow">
            <path d="M4 2l16 10-7 1.5L9.5 21z" className="fill-foreground-strong stroke-background" strokeWidth={1.5} />
          </svg>
          <span className="bg-foreground-strong text-background absolute top-4 left-3.5 rounded-md px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap">
            Maya
          </span>
        </div>

        {/* Terminal: bottom left on desktop, docked at the top on phones */}
        <div
          ref={term}
          className={cn(
            "bg-terminal text-terminal-foreground border-terminal-border absolute inset-x-2.5 top-14 z-10 rounded-xl border px-3 py-2.5 font-mono text-[11px] leading-[1.7] shadow-2xl transition-[opacity,transform] duration-400 md:inset-x-auto md:top-auto md:bottom-4 md:left-4 md:w-[min(500px,calc(100%-2rem))] md:px-4 md:py-3 md:text-[12.5px]",
            frame.termOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0 md:translate-y-3",
          )}
        >
          <div className="text-terminal-muted mb-1.5 flex justify-between text-[11px]">
            <span>{frame.term?.name ?? "claude"}</span>
            <span>~/notes</span>
          </div>
          {frame.term?.lines.map((l, i) => (
            <p key={i} className="break-words whitespace-pre-wrap">
              {l.kind === "prompt" ? (
                <>
                  <span className="text-terminal-muted">{frame.term?.name} ›</span> <span className="text-terminal-command">{l.text}</span>
                </>
              ) : l.kind === "cmd" ? (
                <span className="text-terminal-muted">● {l.text}</span>
              ) : (
                <>
                  <span className="text-terminal-command font-semibold">{l.strong}</span> <span className="text-terminal-muted">{l.rest}</span>
                </>
              )}
            </p>
          ))}
        </div>

        {/* Who wrote it */}
        <div
          className={cn(
            "bg-card text-foreground-strong absolute top-14 right-4 z-10 hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-lg transition-[opacity,transform] duration-400 md:flex",
            frame.badge ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0",
          )}
        >
          <span className="bg-foreground-strong size-2 rounded-full" />
          {frame.badge ?? ""}
        </div>
      </div>
    </div>
  );
}
