"use client";

import { FileText, FolderKanban, Search, Shapes } from "lucide-react";
import { useEffect, useState } from "react";
import { OctopusMark } from "@/components/octopus-mark";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";
import { ChatGPTMark, ClaudeMark, GeminiMark } from "../brand-marks";
import { Typed } from "./typed";

/**
 * Octonote as memory for coding agents, one agent per chapter, each in its
 * own terminal tab beside the Octonote app:
 * Claude Code saves a project (0–4) · Codex recalls a decision (5–8) ·
 * Gemini CLI draws a canvas (9–12). Plays while on screen; the chapter
 * buttons underneath jump to an agent.
 */
const DURATIONS = [2600, 1300, 1700, 1500, 2600, 1800, 1200, 1200, 3200, 2400, 1600, 1500, 3200];

type Agent = "claude" | "codex" | "gemini";

const CHAPTERS: { agent: Agent; label: string; at: number; caption: string }[] = [
  { agent: "claude", label: "Claude Code", at: 0, caption: "Ask Claude Code to write it up. It's saved to your notebook." },
  { agent: "codex", label: "Codex", at: 5, caption: "A week later, Codex finds what you decided." },
  { agent: "gemini", label: "Gemini CLI", at: 9, caption: "Gemini CLI draws it as a real, editable canvas." },
];

const CLAUDE_ASK = "Save what we figured out about the cache bug to my Research notebook, with a diagram";
const CODEX_ASK = "What did we decide about rate limits?";
const GEMINI_ASK = "Draw our deploy pipeline as an Octonote canvas in Research";

export function CodingAgentsDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % DURATIONS.length), DURATIONS[step]);
    return () => clearTimeout(id);
  }, [step, inView, reduced]);

  const chapter = [...CHAPTERS].reverse().find((c) => step >= c.at)!;
  const local = step - chapter.at;

  return (
    <div ref={ref}>
      <div
        aria-hidden
        className="bg-card overflow-hidden rounded-2xl border text-left shadow-lg select-none md:grid md:h-[560px] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      >
        <Terminal agent={chapter.agent} step={local} />
        <OctonoteApp agent={chapter.agent} step={local} />
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <p className="text-foreground-strong text-center text-base font-medium md:text-lg" aria-live="polite">
          {chapter.caption}
        </p>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Agents in the demo">
          {CHAPTERS.map((c) => (
            <button
              key={c.agent}
              type="button"
              aria-pressed={chapter === c}
              onClick={() => setStep(c.at)}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
                chapter === c ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Left: the terminal, one tab per agent ───────────── */

function Terminal({ agent, step }: { agent: Agent; step: number }) {
  return (
    <div className="bg-terminal text-terminal-foreground [&_.animate-pulse]:bg-terminal-foreground flex h-[440px] flex-col border-b font-mono text-[12px] leading-relaxed md:h-auto md:border-r md:border-b-0 md:text-[12.5px]">
      <div className="border-terminal-border flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <span className="flex gap-1.5">
          <span className="bg-window-close size-3 rounded-full" />
          <span className="bg-window-minimize size-3 rounded-full" />
          <span className="bg-window-zoom size-3 rounded-full" />
        </span>
        <div className="ml-3 flex min-w-0 gap-1 font-sans text-[11px]">
          {(["claude", "codex", "gemini"] as Agent[]).map((a) => (
            <span
              key={a}
              className={cn(
                "flex min-w-0 items-center gap-1.5 truncate rounded-md px-2.5 py-1",
                a === agent ? "bg-terminal-border/70 text-terminal-command" : "text-terminal-muted",
              )}
            >
              <AgentMark agent={a} className="size-3.5 shrink-0" />
              <span className="truncate">{a}</span>
            </span>
          ))}
        </div>
      </div>
      <div key={agent} className="animate-in fade-in flex min-h-0 flex-1 flex-col justify-end overflow-hidden p-4 duration-300 md:p-5">
        {agent === "claude" ? <ClaudeCode step={step} /> : null}
        {agent === "codex" ? <Codex step={step} /> : null}
        {agent === "gemini" ? <GeminiCli step={step} /> : null}
      </div>
    </div>
  );
}

const CLAUDE_ORANGE = "text-[#d97757]";

function ClaudeCode({ step }: { step: number }) {
  return (
    <div className="space-y-3">
      <div className="border-[#d97757]/60 w-fit max-w-full rounded-md border px-3 py-2">
        <div className="flex items-center gap-3">
          <ClaudeMark className="size-7 shrink-0" />
          <div>
            <p>
              Welcome to <span className="text-terminal-command font-semibold">Claude Code</span>!
            </p>
            <p className="text-terminal-muted">cwd: ~/shop-api</p>
          </div>
        </div>
      </div>

      {step >= 1 ? (
        <>
          <p className="text-terminal-muted">
            {">"} <span className="text-terminal-foreground">{CLAUDE_ASK}</span>
          </p>
          <Tool dot={CLAUDE_ORANGE} name="Bash" arg="octonote guide" result="Octonote CLI guide (148 lines)" />
          <Tool dot={CLAUDE_ORANGE} name="Write" arg="bug.md" result="Wrote 31 lines: the fix, root cause, repro" />
          <Tool dot={CLAUDE_ORANGE} name="Write" arg="bug.mmd" result="Wrote 9 lines: flowchart TD" />
        </>
      ) : null}
      {step >= 2 ? (
        <Tool
          dot={step >= 3 ? "text-emerald-500" : CLAUDE_ORANGE}
          name="Bash"
          arg='octonote project create "Cache bug: stale reads" --note bug.md --canvas-mermaid bug.mmd --notebook Research'
          result={step >= 3 ? "✓ Created prj_8f2k… → octonote.ai/p/cache-bug-stale-reads" : undefined}
        />
      ) : null}
      {step >= 3 ? (
        <p className="animate-in fade-in">
          <span className="text-terminal-command">⏺</span> Saved “Cache bug: stale reads” to Research, with the diagram.
        </p>
      ) : null}

      <div className="border-terminal-border rounded-md border px-3 py-2">
        <span className="text-terminal-muted">{">"} </span>
        {step === 0 ? <Typed text={CLAUDE_ASK} active /> : null}
      </div>
      <p className="text-terminal-muted -mt-1 text-[11px]">? for shortcuts</p>
    </div>
  );
}

function Tool({ dot, name, arg, result }: { dot: string; name: string; arg: string; result?: string }) {
  return (
    <div className="animate-in fade-in">
      <p className="break-all">
        <span className={dot}>⏺</span> <span className="text-terminal-command font-semibold">{name}</span>({arg})
      </p>
      {result ? <p className="text-terminal-muted pl-4">⎿ {result}</p> : null}
    </div>
  );
}

function Codex({ step }: { step: number }) {
  return (
    <div className="space-y-3">
      <div className="border-terminal-border w-fit rounded-md border px-3 py-2">
        <div className="flex items-center gap-3">
          <ChatGPTMark className="text-terminal-command size-7 shrink-0" />
          <div>
            <p className="text-terminal-command font-semibold">{">_"} OpenAI Codex</p>
            <p className="text-terminal-muted">directory: ~/shop-api</p>
          </div>
        </div>
      </div>

      {step >= 1 ? (
        <>
          <p>
            <span className="text-terminal-muted">›</span> {CODEX_ASK}
          </p>
          <p className="animate-in fade-in">
            <span className="text-emerald-500">•</span> Ran <span className="text-terminal-command">octonote search &quot;rate limit&quot;</span>
          </p>
          <p className="text-terminal-muted animate-in fade-in pl-4">└ Rate limits: decision · note · Research</p>
        </>
      ) : null}
      {step >= 2 ? (
        <>
          <p className="animate-in fade-in">
            <span className="text-emerald-500">•</span> Ran <span className="text-terminal-command">octonote note show pag_r4t3…</span>
          </p>
          <p className="text-terminal-muted animate-in fade-in pl-4">└ 42 lines</p>
        </>
      ) : null}
      {step >= 3 ? (
        <p className="animate-in fade-in">
          <span className="text-terminal-command">•</span> From “Rate limits: decision” in Research: a token bucket per user, 100 requests a minute
          with bursts of 20, and a 429 with Retry-After when a client goes over.
        </p>
      ) : null}

      <div className="border-terminal-border rounded-md border px-3 py-2">
        <span className="text-terminal-muted">› </span>
        {step === 0 ? <Typed text={CODEX_ASK} active /> : null}
      </div>
      <p className="text-terminal-muted -mt-1 text-[11px]">⏎ send · ⇧⏎ newline · ⌃C quit</p>
    </div>
  );
}

function GeminiCli({ step }: { step: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <GeminiMark className="size-7 shrink-0" />
        <p className="bg-gradient-to-r from-[#4796e3] via-[#9177c7] to-[#ca6673] bg-clip-text text-[18px] font-bold tracking-[0.3em] text-transparent">
          GEMINI
        </p>
      </div>
      <p className="text-terminal-muted">Using: 1 GEMINI.md file</p>

      {step >= 1 ? (
        <p>
          <span className="text-terminal-muted">{">"}</span> {GEMINI_ASK}
        </p>
      ) : null}
      {step >= 1 ? (
        <div className="border-terminal-border animate-in fade-in rounded-md border px-3 py-2">
          <p className="break-all">
            <span className={step >= 2 ? "text-emerald-500" : "text-terminal-muted"}>{step >= 2 ? "✓" : "⊷"}</span>{" "}
            <span className="text-terminal-command font-semibold">Shell</span> octonote canvas create &quot;Deploy pipeline&quot; --from-mermaid
            deploy.mmd --notebook Research
          </p>
          {step >= 2 ? <p className="text-terminal-muted mt-1">Created cnv_d3p1… → octonote.ai/c/deploy-pipeline</p> : null}
        </div>
      ) : null}
      {step >= 3 ? (
        <p className="animate-in fade-in">
          <span className="text-[#9177c7]">✦</span> Drew “Deploy pipeline” in Research: push, tests, build, staging, then production
          behind an approval.
        </p>
      ) : null}

      <div className="rounded-md border border-[#9177c7]/60 px-3 py-2">
        <span className="text-[#9177c7]">{">"} </span>
        {step === 0 ? <Typed text={GEMINI_ASK} active /> : <span className="text-terminal-muted">Type your message or @path/to/file</span>}
      </div>
      <p className="text-terminal-muted -mt-1 text-[11px]">~/shop-api · gemini</p>
    </div>
  );
}

/* ───────────── Right: the Octonote app ───────────── */

const RESEARCH = [
  { icon: FileText, title: "Rate limits: decision", meta: "Note · 1w" },
  { icon: FileText, title: "Postgres indexing notes", meta: "Note · 2w" },
  { icon: Shapes, title: "Service map", meta: "Canvas · 3w" },
];

function OctonoteApp({ agent, step }: { agent: Agent; step: number }) {
  const saved = (agent === "claude" && step >= 3) || (agent === "gemini" && step >= 2);
  const found = agent === "codex" && step >= 2;

  return (
    <div className="bg-background flex h-[440px] text-[13px] md:h-auto">
      <div className="bg-sidebar hidden w-40 shrink-0 flex-col gap-0.5 border-r p-3 lg:flex">
        <div className="mb-3 flex items-center gap-2 px-1.5 py-1">
          <OctopusMark className="text-foreground-strong size-5" paper="var(--sidebar)" />
          <span className="text-foreground-strong text-[14px] font-bold tracking-tight">Octonote AI</span>
        </div>
        {["Home", "Notes", "Canvases", "Projects"].map((n) => (
          <span key={n} className="text-muted-foreground rounded-md px-2 py-1.5">
            {n}
          </span>
        ))}
        <p className="text-muted-foreground mt-3 px-2 text-[10px] font-medium tracking-wide uppercase">Notebooks</p>
        <span className="bg-accent text-foreground rounded-md px-2 py-1.5 font-medium">Research</span>
        <span className="text-muted-foreground px-2 py-1.5">Team wiki</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4 text-xs">
          <span className="text-muted-foreground">Research</span>
          {saved || found ? (
            <>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate font-medium">
                {agent === "claude" ? "Cache bug: stale reads" : agent === "codex" ? "Rate limits: decision" : "Deploy pipeline"}
              </span>
            </>
          ) : null}
          {found ? (
            <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1">
              <Search className="size-3" /> read by Codex
            </span>
          ) : saved ? (
            <span className="text-muted-foreground ml-auto shrink-0">
              by {agent === "claude" ? "Claude Code" : "Gemini CLI"}, just now
            </span>
          ) : null}
        </div>

        <div key={`${agent}-${saved || found}`} className="animate-in fade-in min-h-0 flex-1 overflow-hidden duration-500">
          {agent === "claude" && saved ? <ProjectView /> : null}
          {agent === "codex" && found ? <NoteView /> : null}
          {agent === "gemini" && saved ? <CanvasView /> : null}
          {!saved && !found ? <NotebookList agent={agent} /> : null}
        </div>
      </div>
    </div>
  );
}

function NotebookList({ agent }: { agent: Agent }) {
  const items =
    agent === "codex"
      ? [{ icon: FolderKanban, title: "Cache bug: stale reads", meta: "Project · 1w" }, ...RESEARCH]
      : agent === "gemini"
        ? [{ icon: FolderKanban, title: "Cache bug: stale reads", meta: "Project · 1w" }, ...RESEARCH]
        : RESEARCH;
  return (
    <div className="p-4">
      <p className="text-foreground-strong text-xl font-bold">Research</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{items.length} items</p>
      <div className="mt-4 divide-y rounded-lg border">
        {items.map((it) => (
          <div
            key={it.title}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5",
              agent === "codex" && it.title.startsWith("Rate") && "bg-accent",
            )}
          >
            <it.icon className="text-muted-foreground size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{it.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectView() {
  return (
    <div className="grid h-full grid-cols-2">
      <div className="space-y-3 overflow-hidden border-r p-4">
        <p className="text-foreground-strong text-lg font-bold leading-tight">Cache bug: stale reads</p>
        <p className="text-foreground-strong font-semibold">Root cause</p>
        <p className="text-muted-foreground leading-relaxed">
          Product updates cleared the page cache but not the API cache, so reads kept old prices for up to 5 minutes.
        </p>
        <p className="text-foreground-strong font-semibold">The fix</p>
        <p className="text-muted-foreground leading-relaxed">Clear both keys in the same transaction as the write.</p>
      </div>
      <div className="bg-muted/30 grid place-items-center p-3">
        <MiniFlow nodes={["Update product", "Clear API + page cache", "Next read refills"]} />
      </div>
    </div>
  );
}

function NoteView() {
  return (
    <div className="space-y-3 p-5">
      <p className="text-foreground-strong text-xl font-bold">Rate limits: decision</p>
      <p className="text-muted-foreground text-xs">Decided Mar 4 · Research</p>
      <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
        <li>
          <mark className="bg-yellow-200/70 text-foreground rounded-sm px-0.5 dark:bg-yellow-500/30">
            Token bucket per user: 100 requests a minute, bursts of 20.
          </mark>
        </li>
        <li>
          <mark className="bg-yellow-200/70 text-foreground rounded-sm px-0.5 dark:bg-yellow-500/30">
            Over the limit: 429 with a Retry-After header.
          </mark>
        </li>
        <li className="text-muted-foreground">Partners get their own bucket, set per key.</li>
      </ul>
      <div className="bg-muted/30 mt-2 grid place-items-center rounded-lg border p-3">
        <MiniFlow nodes={["Request", "Token bucket", "API or 429"]} />
      </div>
    </div>
  );
}

function CanvasView() {
  // Laid out as a snake: the second row runs right to left, from Staging to Production.
  const nodes = ["Push", "Tests", "Build image", "Production", "Approve", "Staging"];
  return (
    <div className="relative h-full bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:16px_16px] p-5">
      <p className="text-foreground-strong text-lg font-bold">Deploy pipeline</p>
      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-8">
        {nodes.map((n, i) => (
          <div key={n} className="relative">
            <div
              className={cn(
                "bg-card rounded-md border-[1.5px] px-2 py-2 text-center text-xs font-medium shadow-sm",
                n === "Approve" ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-foreground",
              )}
            >
              {n}
            </div>
            {i % 3 !== 2 ? (
              <span className="text-muted-foreground absolute top-1/2 -right-6 w-6 -translate-y-1/2 text-center text-xs leading-none">
                {i < 3 ? "→" : "←"}
              </span>
            ) : null}
            {i === 2 ? <span className="bg-muted-foreground absolute -bottom-8 left-1/2 h-8 w-px" /> : null}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground absolute bottom-4 left-5 text-[11px]">Drawn from mermaid · every box is editable</p>
    </div>
  );
}

function MiniFlow({ nodes }: { nodes: string[] }) {
  return (
    <div className="flex flex-col items-center">
      {nodes.map((n, i) => (
        <div key={n} className="flex flex-col items-center">
          <span className="bg-card rounded-md border-[1.5px] border-foreground px-3 py-1.5 text-center text-[11px] font-medium">{n}</span>
          {i < nodes.length - 1 ? <span className="bg-muted-foreground h-5 w-px" /> : null}
        </div>
      ))}
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

function AgentMark({ agent, className }: { agent: Agent; className?: string }) {
  if (agent === "claude") return <ClaudeMark className={className} />;
  if (agent === "gemini") return <GeminiMark className={className} />;
  return <ChatGPTMark className={cn("text-terminal-command", className)} />;
}
