"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { FileText, GitBranch, Heading1, LayoutGrid, Sigma } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

const PAGES = [
  "Rate limiter",
  "Big-O cheat sheet",
  "Bayes' theorem",
  "Git workflow",
];
const EQUATION = String.raw`\text{tokens}(t) = \min\big(b,\; \text{tokens}(t_0) + r\,(t - t_0)\big)`;

/** Writing a note: text, a KaTeX equation, then `/` → Mermaid diagram rendered in place. */
export function NotesDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(8);
  const slash = step === 5;
  const diagram = step >= 6;
  const equation = useMemo(
    () =>
      katex.renderToString(EQUATION, {
        displayMode: true,
        throwOnError: false,
      }),
    [],
  );

  return (
    <div ref={ref}>
      <DemoWindow
        title="Octonote AI — Rate limiter"
        bodyClassName="flex h-[460px] md:h-[600px]"
      >
        <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
          <p className="text-muted-foreground mb-3 px-2 text-xs font-medium">
            Notes
          </p>
          {PAGES.map((p, i) => (
            <div
              key={p}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                i === 0 && "bg-accent font-medium",
              )}
            >
              <FileText className="text-muted-foreground size-4" />
              {p}
            </div>
          ))}
        </aside>

        <div className="relative flex-1 overflow-hidden px-5 py-6 text-left md:px-16 md:py-10">
          <h3 className="text-foreground-strong min-h-10 text-3xl font-bold tracking-tight md:min-h-12 md:text-4xl">
            <Typed text="Rate limiter" active={step >= 1} done={step >= 2} />
          </h3>
          <p className="text-foreground mt-3 min-h-7 text-base md:mt-5 md:text-lg">
            <Typed
              text="Each request spends a token; the bucket refills at rate r."
              active={step >= 2}
              done={step >= 3}
            />
          </p>

          <Reveal show={step >= 3}>
            <div
              className="text-foreground-strong hide-scrollbar mt-4 overflow-x-auto text-[3.1vw] sm:text-lg [&_.katex-display]:my-2"
              dangerouslySetInnerHTML={{ __html: equation }}
            />
          </Reveal>

          <Reveal show={step >= 4}>
            <h4 className="text-foreground-strong mt-4 text-2xl font-semibold">
              Request flow
            </h4>
          </Reveal>

          <div className="relative mt-3 h-8">
            {slash ? (
              <p className="text-foreground text-lg">
                <Typed text="/mermaid" active done={false} />
              </p>
            ) : null}
            <div
              className={cn(
                "bg-popover ease-standard absolute top-9 left-0 z-10 w-64 rounded-lg border p-1.5 shadow-lg transition-all duration-300",
                slash
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0",
              )}
            >
              {[
                { icon: Heading1, label: "Heading" },
                { icon: Sigma, label: "Math" },
                { icon: GitBranch, label: "Mermaid diagram", active: true },
                { icon: LayoutGrid, label: "Canvas figure" },
              ].map(({ icon: Icon, label, active }) => (
                <div
                  key={label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                    active && "bg-accent",
                  )}
                >
                  <Icon className="text-muted-foreground size-4" />
                  {label}
                </div>
              ))}
            </div>
            <Reveal
              show={diagram}
              className="absolute top-0 left-0 w-full max-w-xl"
            >
              <div className="overflow-hidden rounded-xl border">
                <div className="bg-muted/40 grid h-32 place-items-center md:h-44">
                  <FlowDiagram />
                </div>
                <div className="text-muted-foreground flex items-center gap-2 border-t px-4 py-2.5 text-xs md:text-sm">
                  <GitBranch className="size-4" />
                  Mermaid · written as text, rendered as a diagram
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </DemoWindow>
    </div>
  );
}

/** Static stand-in for the rendered Mermaid flowchart (Clients → Gateway → limiter → App / 429). */
function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 360 110"
      className="text-foreground h-36 w-full max-w-lg"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <g fontSize="11" fill="currentColor" stroke="none" fontFamily="inherit">
        <text x="30" y="58" textAnchor="middle">
          Clients
        </text>
        <text x="115" y="58" textAnchor="middle">
          Gateway
        </text>
        <text x="205" y="58" textAnchor="middle">
          Limiter
        </text>
        <text x="305" y="30" textAnchor="middle">
          App
        </text>
        <text x="305" y="92" textAnchor="middle">
          429
        </text>
      </g>
      <rect x="4" y="40" width="52" height="28" rx="6" />
      <rect x="86" y="40" width="58" height="28" rx="6" />
      <path d="M205 30l30 24-30 24-30-24z" />
      <rect x="276" y="12" width="58" height="28" rx="6" />
      <rect
        x="276"
        y="74"
        width="58"
        height="28"
        rx="6"
        strokeDasharray="3 3"
      />
      <path d="M56 54h28m-4-3 4 3-4 3M144 54h29m-4-3 4 3-4 3M232 46l42-18m-5 0 5-0.5-2 4.5M232 62l42 22m-5 1 5-0.5-3-4" />
    </svg>
  );
}
