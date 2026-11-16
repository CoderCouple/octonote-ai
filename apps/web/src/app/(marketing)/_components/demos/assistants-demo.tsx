"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Ellipsis,
  FileText,
  FolderKanban,
  GripVertical,
  Hash,
  Loader2,
  Mic,
  PanelLeft,
  Plus,
  Puzzle,
  RotateCw,
  Scissors,
  Shapes,
  SlidersHorizontal,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { OctopusMark } from "@/components/octopus-mark";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import { ChatGPTMark, ClaudeMark, GeminiMark } from "../brand-marks";
import { Typed } from "./typed";

/**
 * Octonote with Claude, ChatGPT and Gemini, in one Chrome window:
 * 0–2 ask Claude to save a note (the connector) · 3 the note in Octonote ·
 * 4–6 clip a Gemini answer into the side panel · 7–9 bring a note into ChatGPT with #octonote.
 * Plays while on screen; the chapter buttons underneath jump to a part.
 */
const DURATIONS = [3200, 1500, 2600, 3800, 1600, 1300, 2000, 1500, 1800, 3400];

const CHAPTERS = [
  { label: "Ask Claude", at: 0, caption: "Ask in the chat. Claude saves it to Octonote.", soon: false },
  { label: "A real note", at: 3, caption: "…and it's a real note, with math and a diagram.", soon: false },
  { label: "Clip answers", at: 4, caption: "Clip the best answers from Gemini, ChatGPT or Claude.", soon: true },
  { label: "Bring notes in", at: 7, caption: "Type #octonote to bring a note into any of them.", soon: true },
] as const;

const PROMPT =
  "Write up our caching plan as an Octonote note, with a diagram of how a request flows. Put it in Research.";

type Site = "claude" | "octonote" | "gemini" | "chatgpt";

const SITES: Record<Site, { tab: string; host: string; path: string }> = {
  claude: { tab: "Caching plan for the API", host: "claude.ai", path: "/chat/4f1c-caching-plan" },
  octonote: { tab: "Caching plan · Octonote", host: "octonote.ai", path: "/p/caching-plan" },
  gemini: { tab: "Caching the product API", host: "gemini.google.com", path: "/app/8c2e1f04b7" },
  chatgpt: { tab: "API docs draft", host: "chatgpt.com", path: "/c/6823-api-docs" },
};

export function AssistantsDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % DURATIONS.length), DURATIONS[step]);
    return () => clearTimeout(id);
  }, [step, inView, reduced]);

  const site: Site = step <= 2 ? "claude" : step === 3 ? "octonote" : step <= 6 ? "gemini" : "chatgpt";
  const panel = site === "gemini" || site === "chatgpt";
  const chapter = [...CHAPTERS].reverse().find((c) => step >= c.at)!;

  return (
    <div ref={ref}>
      <div
        aria-hidden
        className="bg-card text-card-foreground overflow-hidden rounded-2xl border text-left shadow-lg select-none"
      >
        <BrowserBar site={site} panel={panel} />
        <div className={cn("grid md:h-[580px]", panel ? "md:grid-cols-[minmax(0,1fr)_340px]" : "md:grid-cols-1")}>
          {site === "claude" ? <Claude step={step} /> : null}
          {site === "octonote" ? <OctonoteNote /> : null}
          {site === "gemini" ? <Gemini step={step} /> : null}
          {site === "chatgpt" ? <ChatGPT step={step} /> : null}
          {panel ? <SidePanel step={step} /> : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <p className="text-foreground-strong flex items-center gap-2 text-center text-base font-medium md:text-lg" aria-live="polite">
          {chapter.caption}
          {chapter.soon ? <Soon /> : null}
        </p>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Parts of the demo">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              aria-pressed={chapter === c}
              onClick={() => setStep(c.at)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                chapter === c ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="tabular-nums opacity-60">{i + 1}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Soon() {
  return <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">Coming soon</span>;
}

/* ───────────── Chrome: tabs and toolbar ───────────── */

function BrowserBar({ site, panel }: { site: Site; panel: boolean }) {
  const { host, path } = SITES[site];
  return (
    <div className="bg-muted/60 border-b">
      <div className="flex h-10 items-end gap-1 px-3">
        <span className="mr-3 mb-3.5 flex gap-1.5">
          <span className="bg-window-close size-3 rounded-full" />
          <span className="bg-window-minimize size-3 rounded-full" />
          <span className="bg-window-zoom size-3 rounded-full" />
        </span>
        {(Object.keys(SITES) as Site[]).map((s) => (
          <div
            key={s}
            className={cn(
              "flex h-8 w-40 min-w-0 items-center gap-2 rounded-t-lg px-3 text-xs transition-colors md:w-48",
              s === site ? "bg-card text-foreground" : "text-muted-foreground max-sm:hidden",
            )}
          >
            <Favicon site={s} />
            <span className="truncate">{SITES[s].tab}</span>
            {s === site ? <X className="text-muted-foreground ml-auto size-3 shrink-0" /> : null}
          </div>
        ))}
        <Plus className="text-muted-foreground mb-2 ml-1 size-4 shrink-0" />
      </div>
      <div className="bg-card flex h-10 items-center gap-3 px-3">
        <ArrowLeft className="text-muted-foreground size-4 shrink-0" />
        <ArrowRight className="text-muted-foreground/50 size-4 shrink-0" />
        <RotateCw className="text-muted-foreground size-3.5 shrink-0" />
        <div className="bg-muted text-muted-foreground h-7 min-w-0 flex-1 truncate rounded-full px-4 text-xs leading-7">
          <span className="text-foreground">{host}</span>
          {path}
        </div>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", panel && "bg-accent")}>
          <ExtensionIcon className="size-[18px]" />
        </span>
        <Puzzle className="text-muted-foreground size-4 shrink-0" />
      </div>
    </div>
  );
}

function Favicon({ site }: { site: Site }) {
  if (site === "octonote") return <ExtensionIcon className="size-4 shrink-0" />;
  if (site === "claude") return <ClaudeMark className="size-4 shrink-0" />;
  if (site === "gemini") return <GeminiMark className="size-4 shrink-0" />;
  return <ChatGPTMark className="text-foreground size-4 shrink-0" />;
}

/** The extension's toolbar icon: the white octopus on a black rounded square. */
function ExtensionIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-[22%] bg-(--tile) text-white [--tile:#0a0a0a] dark:text-neutral-950 dark:[--tile:#fff]",
        className,
      )}
    >
      <OctopusMark className="size-[72%]" paper="var(--tile)" />
    </span>
  );
}

/* ───────────── Claude (the connector) ───────────── */

function Claude({ step }: { step: number }) {
  const sent = step >= 1;
  const done = step >= 2;

  return (
    <div className="flex min-h-[520px] bg-[#faf9f5] text-[13px] text-[#3d3929] md:min-h-0 dark:bg-[#262624] dark:text-[#e8e6dc]">
      <div className="hidden w-12 flex-col items-center gap-4 border-r border-black/5 pt-3 sm:flex dark:border-white/5">
        <PanelLeft className="size-4 opacity-60" />
        <span className="grid size-6 place-items-center rounded-full bg-[#d97757] text-white">
          <Plus className="size-3.5" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-1 px-4 text-[13px]">
          {sent ? "Caching plan for the API" : "New chat"}
          <ChevronDown className="size-3.5 opacity-50" />
        </div>

        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col overflow-hidden px-4">
          {sent ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-500">
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-[#f0eee6] px-4 py-2.5 dark:bg-[#141413]">{PROMPT}</div>

              <div className="w-fit max-w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2 text-[12px]">
                  <ExtensionIcon className="size-4" />
                  <span className="font-medium">Octonote</span>
                  <span className="opacity-60">create_project</span>
                  {done ? <Check className="size-3.5 text-emerald-600" /> : <Loader2 className="size-3.5 animate-spin opacity-60" />}
                </div>
                {done ? (
                  <p className="animate-in fade-in mt-1 font-mono text-[11px] opacity-60">
                    “Caching plan” · note + canvas · Research
                  </p>
                ) : null}
              </div>

              {done ? (
                <div className="animate-in fade-in slide-in-from-bottom-1 space-y-3 font-serif text-[14px] leading-relaxed duration-500">
                  <p>
                    Done. I saved <strong>Caching plan</strong> to your Research notebook: the steps, the hit-rate formula, and a
                    canvas of how a request flows through the cache.
                  </p>
                  <div className="relative flex w-full max-w-sm items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2.5 font-sans dark:border-white/10 dark:bg-[#30302e]">
                    <ExtensionIcon className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">Caching plan</span>
                      <span className="block truncate text-[11px] opacity-60">octonote.ai/p/caching-plan</span>
                    </span>
                    <ArrowUpRight className="size-4 opacity-60" />
                    <Pointer className="animate-in fade-in top-5 right-12 duration-700" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex-1" />

          <div className="mb-4 rounded-2xl border border-black/10 bg-white px-4 pt-3 pb-2.5 shadow-sm dark:border-white/10 dark:bg-[#30302e]">
            <div className="min-h-[40px]">
              {sent ? (
                <span className="opacity-50">Reply to Claude…</span>
              ) : (
                <Typed text={PROMPT} active={!sent} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg border border-black/10 dark:border-white/10">
                <Plus className="size-3.5 opacity-70" />
              </span>
              <span className="grid size-7 place-items-center rounded-lg border border-black/10 dark:border-white/10">
                <SlidersHorizontal className="size-3.5 opacity-70" />
              </span>
              <span className="flex-1" />
              <span className="text-[12px] opacity-60">Opus 5.5</span>
              <ChevronDown className="size-3 opacity-50" />
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-lg text-white",
                  sent ? "bg-[#d97757]/40" : "bg-[#d97757]",
                )}
              >
                <ArrowUp className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Octonote: the note Claude wrote ───────────── */

function OctonoteNote() {
  const nav = ["Home", "Notes", "Canvases", "Projects", "Notebooks"];
  return (
    <div className="bg-background animate-in fade-in flex min-h-[520px] text-[13px] duration-500 md:min-h-0">
      <div className="bg-sidebar hidden w-52 shrink-0 flex-col gap-0.5 border-r p-3 md:flex">
        <div className="mb-3 flex items-center gap-2 px-2 py-1">
          <OctopusMark className="text-foreground-strong size-6" paper="var(--sidebar)" />
          <span className="text-foreground-strong text-[15px] font-bold tracking-tight">Octonote AI</span>
        </div>
        {nav.map((n) => (
          <span
            key={n}
            className={cn("rounded-md px-2 py-1.5", n === "Projects" ? "bg-accent text-foreground font-medium" : "text-muted-foreground")}
          >
            {n}
          </span>
        ))}
        <p className="text-muted-foreground mt-4 px-2 text-[11px] font-medium tracking-wide uppercase">Notebooks</p>
        <span className="text-foreground px-2 py-1.5">Research</span>
        <span className="text-muted-foreground px-2 py-1.5">Team wiki</span>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden px-6 py-6 md:px-12 md:py-8">
        <p className="text-muted-foreground text-xs">
          Research <span className="opacity-50">/</span> Caching plan <span className="opacity-50">·</span> written by Claude, just now
        </p>
        <h3 className="text-foreground-strong mt-2 text-3xl font-bold tracking-tight md:text-4xl">Caching plan</h3>
        <p className="text-foreground-strong mt-5 text-lg font-semibold">Steps</p>
        <ul className="mt-2 space-y-2 text-[14px]">
          <li className="flex items-center gap-2.5">
            <span className="size-4 rounded border" />
            Measure the hit rate,
            <span className="inline-flex items-center gap-1.5 font-serif italic">
              h =
              <span className="inline-flex flex-col items-center text-[12px] leading-tight">
                <span>hits</span>
                <span className="border-foreground/60 border-t px-1">hits + misses</span>
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="size-4 rounded border" />
            Add Redis in front of Postgres
          </li>
          <li className="flex items-center gap-2.5">
            <span className="size-4 rounded border" />
            Set TTLs and watch for a week
          </li>
        </ul>
        <p className="text-foreground-strong mt-6 text-lg font-semibold">How a request flows</p>
        <div className="bg-card mt-3 overflow-hidden rounded-xl border p-3">
          <FlowDiagram />
        </div>
      </div>
    </div>
  );
}

function FlowDiagram() {
  const box = "fill-card stroke-foreground";
  const text = "fill-foreground text-[13px]";
  return (
    <svg viewBox="0 0 720 150" className="h-auto w-full">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      <g className="stroke-muted-foreground" strokeWidth="1.5" fill="none" markerEnd="url(#flow-arrow)">
        <path d="M120 50 H186" />
        <path d="M330 50 H426" />
        <path d="M330 50 C 380 50, 380 110, 426 110" />
        <path d="M546 110 H606" />
      </g>
      <rect x="10" y="30" width="110" height="40" rx="6" className={box} strokeWidth="1.5" />
      <text x="65" y="55" textAnchor="middle" className={text}>Request</text>
      <path d="M258 14 L330 50 L258 86 L188 50 Z" className={box} strokeWidth="1.5" />
      <text x="259" y="55" textAnchor="middle" className={text}>In cache?</text>
      <text x="372" y="42" className="fill-muted-foreground text-[11px]">yes</text>
      <text x="376" y="98" className="fill-muted-foreground text-[11px]">no</text>
      <rect x="428" y="30" width="118" height="40" rx="6" className={box} strokeWidth="1.5" />
      <text x="487" y="55" textAnchor="middle" className={text}>Return</text>
      <rect x="428" y="90" width="118" height="40" rx="6" className="fill-blue-50 stroke-blue-500 dark:fill-blue-950" strokeWidth="1.5" />
      <text x="487" y="115" textAnchor="middle" className={text}>Postgres</text>
      <rect x="608" y="90" width="102" height="40" rx="6" className={box} strokeWidth="1.5" />
      <text x="659" y="115" textAnchor="middle" className={text}>Return</text>
    </svg>
  );
}

/* ───────────── Gemini: clipping an answer ───────────── */

function Gemini({ step }: { step: number }) {
  const hovering = step >= 5 && step <= 6;
  const clipped = step >= 6;

  return (
    <div className="animate-in fade-in flex min-h-[460px] bg-white text-[13px] text-[#1f1f1f] duration-500 md:min-h-0 dark:bg-[#131314] dark:text-[#e3e3e3]">
      <div className="hidden w-12 flex-col items-center gap-4 bg-[#f0f4f9] pt-3 sm:flex dark:bg-[#1e1f20]">
        <PanelLeft className="size-4 opacity-60" />
        <SquarePen className="size-4 opacity-60" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-1 px-4 text-[17px]">
          Gemini <ChevronDown className="size-4 opacity-50" />
        </div>

        <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col overflow-hidden px-4">
          <div className="ml-auto w-fit max-w-[75%] rounded-[20px] rounded-tr-md bg-[#e9eef6] px-4 py-2.5 dark:bg-[#333537]">
            How should we cache the product API?
          </div>

          <div className={cn("relative mt-5 flex gap-3 rounded-lg transition-colors", hovering && "bg-black/[0.03] dark:bg-white/[0.04]")}>
            <GeminiMark className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="space-y-2 leading-relaxed">
                <p>
                  Put a <strong>read-through cache</strong> in front of it:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Redis, with a 5-minute TTL on product pages.</li>
                  <li>Clear a product's key whenever it changes.</li>
                  <li>Misses fall through to Postgres and refill the cache.</li>
                </ul>
              </div>
              <div className="mt-3 flex gap-3 opacity-60">
                <ThumbsUp className="size-3.5" />
                <ThumbsDown className="size-3.5" />
                <RotateCw className="size-3.5" />
                <Copy className="size-3.5" />
              </div>
            </div>

            <span
              className={cn(
                "bg-foreground text-background absolute -top-1 right-0 inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-md transition-opacity duration-300",
                hovering ? "opacity-100" : "opacity-0",
              )}
            >
              {clipped ? <Check className="size-3.5" /> : <Scissors className="size-3.5" />}
              {clipped ? "Clipped" : "Clip answer"}
            </span>
            <Pointer
              className={cn(
                "transition-all duration-700",
                step === 4 && "top-14 right-36",
                hovering && "top-3 right-10",
              )}
            />
          </div>

          <div className="flex-1" />

          <div className="mb-2">
            <div className="flex items-center gap-3 rounded-full bg-[#f0f4f9] px-5 py-3.5 dark:bg-[#1e1f20]">
              <Plus className="size-4 opacity-60" />
              <span className="flex-1 opacity-60">Ask Gemini</span>
              <Mic className="size-4 opacity-60" />
            </div>
            <p className="mt-1.5 text-center text-[11px] opacity-60">Gemini can make mistakes, so double-check it</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── ChatGPT: bringing a note in with #octonote ───────────── */

function ChatGPT({ step }: { step: number }) {
  return (
    <div className="bg-background animate-in fade-in flex min-h-[460px] text-[13px] duration-500 md:min-h-0">
      <div className="bg-muted/40 hidden w-12 flex-col items-center gap-4 border-r pt-3 sm:flex">
        <PanelLeft className="text-muted-foreground size-4" />
        <SquarePen className="text-muted-foreground size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-1 px-4 text-[15px] font-medium">
          ChatGPT <ChevronDown className="text-muted-foreground size-4" />
        </div>

        <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col overflow-hidden px-4">
          <div className="bg-muted ml-auto w-fit max-w-[75%] rounded-3xl px-4 py-2">Draft the rate-limits section of our API docs.</div>
          <div className="mt-5 space-y-2 leading-relaxed">
            <p>Happy to. Share the limits you've settled on (requests per minute, bursts, and what happens when a client goes over) and I'll write it up with examples.</p>
            <div className="text-muted-foreground flex gap-3 pt-1">
              <Copy className="size-3.5" />
              <ThumbsUp className="size-3.5" />
              <ThumbsDown className="size-3.5" />
              <RotateCw className="size-3.5" />
            </div>
          </div>

          <div className="flex-1" />

          <div className="relative mb-2">
            {step === 8 ? <Picker /> : null}
            <div className="bg-card relative rounded-[26px] border px-4 pt-3 pb-2 shadow-sm">
              <span className="bg-card text-muted-foreground absolute -top-3.5 right-14 grid size-7 place-items-center rounded-md border shadow-sm">
                <Hash className="size-3.5" />
              </span>
              <div className="min-h-[40px] pr-2">
                {step >= 9 ? (
                  <span className="whitespace-pre-line">
                    {"From my Octonote note “Rate limits” (octonote.ai/n/rate-limits):\n100 requests a minute per API key, with bursts of 20…"}
                  </span>
                ) : (
                  <Typed text="#octonote rate" active={step >= 7} done={step >= 8} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Plus className="text-muted-foreground size-4" />
                <span className="flex-1" />
                <Mic className="text-muted-foreground size-4" />
                <span className="bg-foreground text-background grid size-7 place-items-center rounded-full">
                  <ArrowUp className="size-4" />
                </span>
              </div>
            </div>
            <p className="text-muted-foreground mt-1.5 text-center text-[11px]">ChatGPT can make mistakes. Check important info.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The #octonote picker the extension opens over the message box. */
function Picker() {
  const rows = [
    { icon: FileText, title: "Rate limits", meta: "Note · Research · 2d" },
    { icon: Shapes, title: "Rate limiter design", meta: "Canvas · Research · 1w" },
    { icon: FolderKanban, title: "API gateway rollout", meta: "Project · 3w" },
  ];
  return (
    <div className="bg-popover animate-in fade-in slide-in-from-bottom-1 absolute right-2 bottom-full left-2 z-10 mb-2 overflow-hidden rounded-xl border shadow-xl duration-300">
      <p className="text-muted-foreground flex items-center gap-1.5 border-b px-3 py-2 text-xs">
        <Hash className="size-3" />
        Searching Octonote for <span className="text-foreground font-medium">“rate”</span>
      </p>
      <div className="p-1">
        {rows.map((r, i) => (
          <div key={r.title} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2", i === 0 && "bg-accent")}>
            <r.icon className="text-muted-foreground size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.title}</span>
              <span className="text-muted-foreground block truncate text-[11px]">{r.meta}</span>
            </span>
            {i === 0 ? <CornerDownLeft className="text-muted-foreground size-3.5" /> : null}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground border-t px-3 py-1.5 text-[11px]">↑↓ to move · Enter to insert · Esc to close</p>
    </div>
  );
}

function Pointer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 20" className={cn("pointer-events-none absolute size-5 drop-shadow", className)}>
      <path d="M1 1 L1 16 L5 12 L8 19 L10.5 18 L7.5 11 L13 11 Z" className="fill-black stroke-white" strokeWidth="1.2" />
    </svg>
  );
}

/* ───────────── Chrome's side panel with Octonote Clipper ───────────── */

const CLIPS = [
  {
    app: "Claude",
    from: "Retry strategy for webhooks",
    time: "12m",
    body: "Retry with exponential backoff and jitter: 1s, 2s, 4s… capped at 5 minutes, then park the event in a dead-letter queue.",
  },
  {
    app: "ChatGPT",
    from: "Sessions: Postgres or Redis?",
    time: "1h",
    body: "Keep sessions in Redis with a sliding TTL; Postgres stays the source of truth for users and permissions.",
  },
];

function SidePanel({ step }: { step: number }) {
  const clipped = step >= 6;

  return (
    <aside className="bg-background animate-in fade-in slide-in-from-right-4 flex min-h-[440px] flex-col border-t text-[13px] duration-500 md:min-h-0 md:border-t-0 md:border-l">
      <div className="flex h-9 items-center gap-1.5 border-b px-3 text-xs">
        <ExtensionIcon className="size-4" />
        <span className="font-medium">Octonote Clipper</span>
        <ChevronDown className="text-muted-foreground size-3" />
        <X className="text-muted-foreground ml-auto size-3.5" />
      </div>

      <div className="flex items-center gap-2 p-3 pb-2">
        <div className="bg-card flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5">
          <ExtensionIcon className="size-6" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="text-muted-foreground block text-[11px]">Clipping to</span>
            <span className="block truncate font-semibold">API design</span>
          </span>
          <ChevronDown className="text-muted-foreground size-4" />
        </div>
        <span className="text-muted-foreground grid size-9 place-items-center rounded-md">
          <Ellipsis className="size-4" />
        </span>
      </div>

      <div className="flex gap-1 border-b px-3">
        <span className="relative px-2 py-2 font-medium">
          Clips
          <span className="bg-foreground absolute inset-x-2 -bottom-px h-0.5 rounded" />
        </span>
        <span className="text-muted-foreground px-2 py-2 font-medium">Notes</span>
      </div>

      <div className="text-muted-foreground flex items-center justify-between px-3 pt-2.5 pb-1.5 text-xs">
        <span>{clipped ? 3 : 2} clips</span>
        <span className="flex items-center gap-1">
          Drag <GripVertical className="size-3" /> to reorder
        </span>
      </div>

      <div className="max-h-[360px] flex-1 space-y-2 overflow-hidden px-3 [mask-image:linear-gradient(#000_75%,transparent)]">
        {clipped ? (
          <Clip
            n={1}
            app="Gemini"
            from="Caching the product API"
            time="now"
            body="Put a read-through cache in front of it: Redis, with a 5-minute TTL on product pages…"
            fresh={step === 6}
          />
        ) : null}
        {CLIPS.map((c, i) => (
          <Clip key={c.from} n={i + (clipped ? 2 : 1)} {...c} />
        ))}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-medium">
            <CornerDownLeft className="size-3.5" />
            Insert in chat
          </span>
          <span className="bg-primary text-primary-foreground flex h-8 flex-1 items-center justify-center rounded-md text-xs font-medium">
            Write a note
          </span>
        </div>
        <p className="text-muted-foreground mt-2 text-center text-[11px]">Write a summary, report or flashcards in Octonote, citing your clips</p>
      </div>
    </aside>
  );
}

function Clip({ n, app, from, time, body, fresh }: { n: number; app: string; from: string; time: string; body: string; fresh?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 pt-1.5 pb-2.5 transition-colors duration-1000", fresh ? "bg-accent border-ring" : "bg-card")}>
      <div className="text-muted-foreground flex h-7 items-center gap-1.5 text-xs">
        <GripVertical className="-ml-1.5 size-3.5 opacity-50" />
        <span className="text-foreground font-semibold tabular-nums">{n}</span>
        <span className="bg-muted text-foreground rounded px-1.5 py-px text-[10px] font-medium">{app}</span>
        <span className="min-w-0 flex-1 truncate">{from}</span>
        <span className="tabular-nums">{time}</span>
      </div>
      <p className="mt-1 line-clamp-2 leading-relaxed">{body}</p>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
