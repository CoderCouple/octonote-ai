"use client";

import { Columns2, FolderKanban, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

const PROMPT =
  "Document our auth flow with a diagram and publish it in my Architecture notebook";
const COMMAND =
  'octonote project create "Auth flow" --note auth.md --canvas-mermaid auth.mmd --notebook Architecture --publish';

/**
 * Claude Code using the octonote CLI, one beat per step:
 * ask     — 1–2 the prompt types out
 * plan    — 3 reads the guide · 4 writes the markdown + mermaid files
 * run     — 5–6 the command types out · 7 JSON comes back
 * result  — 8 the project appears in Octonote, published · 9 the agent replies (hold)
 */
const STEPS = 10;

export function AgentsDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(STEPS);
  const created = step >= 8;

  return (
    <div ref={ref}>
      <DemoWindow
        title="Claude Code — octonote"
        bodyClassName="grid md:h-[560px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        {/* Terminal */}
        <div className="bg-muted/30 min-h-[320px] overflow-hidden border-b p-5 text-left font-mono text-[12.5px] leading-relaxed md:border-r md:border-b-0 md:p-6 md:text-sm">
          <p className="text-foreground-strong">
            <span className="text-muted-foreground">&gt; </span>
            <Typed text={PROMPT} active={step >= 1} done={step >= 3} />
          </p>

          <Reveal show={step >= 3} className="mt-4">
            <Line tool="Bash" arg="octonote guide" />
          </Reveal>
          <Reveal show={step >= 4} className="mt-2">
            <Line tool="Write" arg="auth.md" note="42 lines" />
            <Line tool="Write" arg="auth.mmd" note="flowchart LR" />
          </Reveal>

          <div className="mt-2 min-h-16">
            {step >= 5 ? (
              <p className="text-foreground break-all">
                <span className="text-foreground-strong">⏺ Bash</span>(
                <Typed text={COMMAND} active={step >= 5} done={step >= 7} />)
              </p>
            ) : null}
          </div>

          <Reveal show={step >= 7}>
            <pre className="text-muted-foreground border-l-2 pl-3 text-[11.5px] whitespace-pre-wrap md:text-xs">
              {`{ "id": "prj_8f2k…", "kind": "project",
  "notebook": "Architecture",
  "publicUrl": "https://octonote.ai/pub/auth-flow-x7q2" }`}
            </pre>
          </Reveal>

          <Reveal show={step >= 9} className="mt-4">
            <p className="text-foreground">
              <span className="text-foreground-strong">⏺ </span>
              Done — “Auth flow” is in Architecture and published at
              octonote.ai/pub/auth-flow-x7q2
            </p>
          </Reveal>
        </div>

        {/* What it made, in Octonote */}
        <div className="relative min-h-[300px] overflow-hidden">
          <div className="flex h-11 items-center gap-2 border-b px-4 text-sm">
            <FolderKanban className="text-muted-foreground size-4 shrink-0" />
            <span
              className={cn(
                "text-foreground-strong truncate font-medium transition-opacity duration-500",
                created ? "opacity-100" : "opacity-0",
              )}
            >
              Architecture / Auth flow
            </span>
            <span
              className={cn(
                "ml-auto flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-opacity duration-500",
                created ? "opacity-100" : "opacity-0",
              )}
            >
              <Globe className="size-3" /> Published
            </span>
          </div>

          {created ? (
            <Reveal show className="grid h-[calc(100%-2.75rem)] grid-cols-2">
              <div className="border-r p-5 text-left">
                <p className="text-foreground-strong text-lg font-bold">
                  Auth flow
                </p>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed md:text-sm">
                  The app sends an email code; Supabase verifies it and returns
                  a session the API trusts.
                </p>
                <div className="mt-4 space-y-2">
                  {[92, 80, 86, 60].map((w) => (
                    <div
                      key={w}
                      className="bg-muted h-2 rounded"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="bg-muted/20 grid place-items-center p-4">
                <FlowDiagram />
              </div>
            </Reveal>
          ) : (
            <div className="text-muted-foreground grid h-[calc(100%-2.75rem)] place-items-center gap-2 text-sm">
              <span className="flex flex-col items-center gap-2">
                <Columns2 className="size-5" />
                Waiting for your agent…
              </span>
            </div>
          )}
        </div>
      </DemoWindow>
    </div>
  );
}

function Line({
  tool,
  arg,
  note,
}: {
  tool: string;
  arg: string;
  note?: string;
}) {
  return (
    <p className="text-foreground">
      <span className="text-foreground-strong">⏺ {tool}</span>({arg})
      {note ? <span className="text-muted-foreground"> · {note}</span> : null}
    </p>
  );
}

/** The canvas the CLI drew from auth.mmd: App → Supabase → API, top to bottom. */
function FlowDiagram() {
  const boxes = [
    { y: 8, label: "App" },
    { y: 68, label: "Supabase" },
    { y: 128, label: "API" },
  ];
  return (
    <svg
      viewBox="0 0 120 170"
      className="text-foreground h-44 w-28 md:h-56 md:w-36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      {boxes.map((b) => (
        <g key={b.label}>
          <rect x="10" y={b.y} width="100" height="34" rx="7" />
          <text
            x="60"
            y={b.y + 21}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            stroke="none"
          >
            {b.label}
          </text>
        </g>
      ))}
      <path d="M60 42v24m-3-5 3 5 3-5M60 102v24m-3-5 3 5 3-5" />
    </svg>
  );
}
