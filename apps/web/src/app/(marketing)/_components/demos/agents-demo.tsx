"use client";

import {
  Check,
  Columns2,
  FileText,
  FolderKanban,
  NotebookPen,
  PlugZap,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { INSTALL } from "../../cli/_data/install";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

const SAVE =
  "Save what we figured out about the cache bug to my Research notebook, with a diagram";
const SAVE_CMD =
  'octonote project create "Cache bug: stale reads" --note bug.md --canvas-mermaid bug.mmd --notebook Research';
const ASK = "What did we decide about rate limits?";

/**
 * Setting up Octonote for Claude Code, then using it as Claude's memory.
 * setup  — 1–3 install · 4–5 sign in · 6–7 teach Claude (CLAUDE.md + skill)
 * save   — 9–10 the prompt · 11 guide + files · 12–13 the command · 14 it lands in Research · 15 reply
 * recall — 16 a new session · 17 the question · 18 search + read · 19 the note opens · 20 the answer (hold)
 */
const STEPS = 21;
const SAVE_AT = 9;
const RECALL_AT = 16;

export function AgentsDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(STEPS);
  const using = step >= SAVE_AT;

  return (
    <div ref={ref}>
      <DemoWindow
        terminal
        title={using ? "Claude Code — your project" : "Terminal — set up once"}
        bodyClassName="grid md:h-[560px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      >
        <div className="bg-terminal text-terminal-foreground [&_.animate-pulse]:bg-terminal-foreground flex h-[360px] flex-col justify-end overflow-hidden border-b p-5 text-left font-mono text-[12px] leading-relaxed md:h-auto md:border-r md:border-b-0 md:p-6 md:text-[13px]">
          {using ? <Session step={step} /> : <Setup step={step} />}
        </div>
        <App step={step} />
      </DemoWindow>
    </div>
  );
}

/* ───────────── Left: the terminal ───────────── */

function Setup({ step }: { step: number }) {
  return (
    <div className="space-y-3">
      <Cmd text={INSTALL} active={step >= 1} done={step >= 4} />
      <Reveal show={step >= 4}>
        <Out>added 1 package · octonote 0.1.3</Out>
      </Reveal>
      <Cmd text="octonote login" active={step >= 4} done={step >= 5} />
      <Reveal show={step >= 5}>
        <Out ok>Signed in as you@example.com</Out>
      </Reveal>
      <Cmd
        text="octonote setup claude --skill"
        active={step >= 6}
        done={step >= 7}
      />
      <Reveal show={step >= 7}>
        <Out ok>Added Octonote to CLAUDE.md</Out>
        <Out ok>Installed the octonote skill for Claude Code</Out>
      </Reveal>
    </div>
  );
}

function Session({ step }: { step: number }) {
  return (
    <div className="space-y-2">
      <Prompt text={SAVE} active={step >= SAVE_AT} done={step >= 11} />
      <Reveal show={step >= 11} className="mt-3">
        <Tool name="Bash" arg="octonote guide" />
        <Tool name="Write" arg="bug.md" note="the fix, root cause, repro" />
        <Tool name="Write" arg="bug.mmd" note="flowchart TD" />
      </Reveal>
      {step >= 12 ? (
        <p className="text-terminal-foreground break-all">
          <span className="text-terminal-command">⏺ Bash</span>(
          <Typed text={SAVE_CMD} active={step >= 12} done={step >= 14} />)
        </p>
      ) : null}
      <Reveal show={step >= 15}>
        <Reply>
          Saved “Cache bug: stale reads” to Research, with the diagram.
        </Reply>
      </Reveal>

      {step >= RECALL_AT ? (
        <>
          <p className="text-terminal-muted flex items-center gap-2 py-2 text-[11px] tracking-wide uppercase">
            <span className="bg-terminal-border h-px flex-1" />a week later ·
            new session
            <span className="bg-terminal-border h-px flex-1" />
          </p>
          <Prompt text={ASK} active={step >= 17} done={step >= 18} />
          <Reveal show={step >= 18} className="mt-2">
            <Tool name="Bash" arg='octonote search "rate limit"' />
            <Tool name="Bash" arg="octonote note show pag_r4t3…" />
          </Reveal>
          <Reveal show={step >= 20}>
            <Reply>
              From “Rate limits: decision” in Research: a token bucket, 100
              requests a minute per user, and a 429 with Retry-After.
            </Reply>
          </Reveal>
        </>
      ) : null}
    </div>
  );
}

function Cmd({
  text,
  active,
  done,
}: {
  text: string;
  active: boolean;
  done: boolean;
}) {
  if (!active) return null;
  return (
    <p className="text-terminal-command break-all">
      <span className="text-terminal-muted">$ </span>
      <Typed text={text} active={active} done={done} />
    </p>
  );
}

function Out({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <p className="text-terminal-muted flex items-center gap-1.5">
      {ok ? (
        <Check className="text-terminal-command size-3.5 shrink-0" />
      ) : null}
      {children}
    </p>
  );
}

function Prompt({
  text,
  active,
  done,
}: {
  text: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <p className="text-terminal-command">
      <span className="text-terminal-muted">&gt; </span>
      <Typed text={text} active={active} done={done} />
    </p>
  );
}

function Tool({
  name,
  arg,
  note,
}: {
  name: string;
  arg: string;
  note?: string;
}) {
  return (
    <p className="text-terminal-foreground">
      <span className="text-terminal-command">⏺ {name}</span>({arg})
      {note ? <span className="text-terminal-muted"> · {note}</span> : null}
    </p>
  );
}

function Reply({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-terminal-foreground font-sans text-[13px] md:text-sm">
      <span className="text-terminal-command">⏺ </span>
      {children}
    </p>
  );
}

/* ───────────── Right: what it looks like in Octonote ───────────── */

const SHELF = [
  { title: "Rate limits: decision", kind: "Project", when: "Last week" },
  { title: "Auth flow", kind: "Project", when: "2 weeks ago" },
  { title: "Postgres indexing notes", kind: "Note", when: "3 weeks ago" },
  { title: "Onboarding ideas", kind: "Note", when: "Last month" },
];

function App({ step }: { step: number }) {
  const using = step >= SAVE_AT;
  const saved = step >= 14;
  const recalling = step >= 19;

  if (!using) {
    const connected = step >= 5;
    const taught = step >= 7;
    return (
      <div className="grid min-h-[300px] place-items-center p-6">
        <div className="w-full max-w-xs space-y-3 text-left">
          <Row
            icon={<PlugZap className="size-4" />}
            done={connected}
            label={
              connected
                ? "CLI connected to your account"
                : "Waiting for sign-in…"
            }
          />
          <Row
            icon={<NotebookPen className="size-4" />}
            done={taught}
            label={
              taught
                ? "Claude Code knows how to use Octonote"
                : "Claude Code not set up yet"
            }
          />
          <p
            className={cn(
              "text-muted-foreground pt-2 text-center text-sm transition-opacity duration-500",
              taught ? "opacity-100" : "opacity-0",
            )}
          >
            That's it. Now just ask Claude.
          </p>
        </div>
      </div>
    );
  }

  if (recalling) {
    return (
      <div className="relative min-h-[300px] overflow-hidden">
        <Header>
          <FolderKanban className="text-muted-foreground size-4 shrink-0" />
          <span className="text-foreground-strong truncate font-medium">
            Research / Rate limits: decision
          </span>
          <span className="text-muted-foreground ml-auto hidden shrink-0 items-center gap-1 text-xs sm:flex">
            <Search className="size-3" /> found by Claude
          </span>
        </Header>
        <Reveal show className="grid h-[calc(100%-2.75rem)] grid-cols-2">
          <div className="border-r p-5 text-left">
            <p className="text-foreground-strong text-lg font-bold">
              Rate limits
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed md:text-sm">
              Token bucket per user: 100 requests a minute, bursts of 20. Over
              the limit → 429 with Retry-After.
            </p>
            <div className="mt-4 space-y-2">
              {[90, 76, 84].map((w) => (
                <div
                  key={w}
                  className="bg-muted h-2 rounded"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
          <div className="bg-muted/20 grid place-items-center p-4">
            <Flow labels={["Request", "Token bucket", "API or 429"]} />
          </div>
        </Reveal>
      </div>
    );
  }

  return (
    <div className="relative min-h-[300px] overflow-hidden">
      <Header>
        <NotebookPen className="text-muted-foreground size-4 shrink-0" />
        <span className="text-foreground-strong font-medium">Research</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {saved ? SHELF.length + 1 : SHELF.length} items
        </span>
      </Header>
      <ul className="divide-y text-left text-sm">
        <li
          className={cn(
            "ease-emphasized overflow-hidden transition-all duration-700",
            saved
              ? "bg-muted/40 max-h-14 opacity-100"
              : "max-h-0 border-transparent opacity-0",
          )}
        >
          <div>
            <Item
              title="Cache bug: stale reads"
              kind="Project"
              when="Just now"
              fresh
            />
          </div>
        </li>
        {SHELF.map((s) => (
          <li key={s.title}>
            <Item {...s} />
          </li>
        ))}
      </ul>
      <p
        className={cn(
          "text-muted-foreground absolute inset-x-0 bottom-5 text-center text-sm transition-opacity duration-500",
          saved ? "opacity-100" : "opacity-0",
        )}
      >
        Every conversation's notes and diagrams, in one place.
      </p>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-2 border-b px-4 text-sm">
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors duration-500",
        done ? "text-foreground-strong" : "text-muted-foreground",
      )}
    >
      <span className="shrink-0">
        {done ? <Check className="size-4" /> : icon}
      </span>
      {label}
    </div>
  );
}

function Item({
  title,
  kind,
  when,
  fresh,
}: {
  title: string;
  kind: string;
  when: string;
  fresh?: boolean;
}) {
  const Icon = kind === "Project" ? Columns2 : FileText;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span
        className={cn(
          "truncate",
          fresh ? "text-foreground-strong font-medium" : "text-foreground",
        )}
      >
        {title}
      </span>
      <span className="text-muted-foreground ml-auto shrink-0 text-xs">
        {when}
      </span>
    </div>
  );
}

/** A tiny three-box flow, top to bottom. */
function Flow({ labels }: { labels: string[] }) {
  return (
    <svg
      viewBox="0 0 120 170"
      className="text-foreground h-44 w-28 md:h-56 md:w-36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      {labels.map((label, i) => (
        <g key={label}>
          <rect x="6" y={8 + i * 60} width="108" height="34" rx="7" />
          <text
            x="60"
            y={29 + i * 60}
            textAnchor="middle"
            fontSize="10.5"
            fill="currentColor"
            stroke="none"
          >
            {label}
          </text>
        </g>
      ))}
      <path d="M60 42v24m-3-5 3 5 3-5M60 102v24m-3-5 3 5 3-5" />
    </svg>
  );
}
