"use client";

/**
 * The auth panel's feature tour — the web twin of the mobile onboarding:
 * one card per feature, each a live animation, auto-advancing with
 * story-style progress dots. Hover pauses; dots jump; arrow keys work.
 * With reduced motion it never auto-advances.
 */
import { Check, FileText, FolderKanban } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CanvasDemo } from "@/app/(marketing)/_components/demos/canvas-demo";
import {
  DemoWindow,
  Reveal,
} from "@/app/(marketing)/_components/demos/demo-window";
import { Typed } from "@/app/(marketing)/_components/demos/typed";
import { useDemoStep } from "@/app/(marketing)/_components/demos/use-demo-step";
import { cn } from "@/lib/utils";

const SLIDE_MS = 8000;

const SLIDES: { title: string; body: string; Demo: () => ReactNode }[] = [
  {
    title: "Write without friction.",
    body: "A clean block editor for headings, lists, to-dos and code. Everything saves as you type.",
    Demo: NotesCard,
  },
  {
    title: "Sketch rough. Get it clean.",
    body: "An infinite canvas for flows, maps and diagrams. Pencil strokes snap into tidy shapes.",
    Demo: CanvasDemo,
  },
  {
    title: "Claude saves it for you.",
    body: "Ask Claude Code to write up what you figured out. It lands in Octonote as a note with a real diagram.",
    Demo: ClaudeCard,
  },
  {
    title: "Codex finds it next week.",
    body: "Codex reads your notes too, so a new session starts from what you already decided.",
    Demo: CodexCard,
  },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  return reduced;
}

export function FeatureCarousel() {
  const [active, setActive] = useState(0);
  // Bumped on every visit to a slide so its demo restarts from the top.
  const [visit, setVisit] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  // Time left on the current slide; survives pauses so hover doesn't restart it.
  const remaining = useRef(SLIDE_MS);

  const go = (i: number) => {
    setActive((i + SLIDES.length) % SLIDES.length);
    setVisit((v) => v + 1);
  };

  useEffect(() => {
    remaining.current = SLIDE_MS;
  }, [active, visit]);

  useEffect(() => {
    if (reduced || paused) return;
    const started = Date.now();
    const id = setTimeout(() => {
      setActive((a) => (a + 1) % SLIDES.length);
      setVisit((v) => v + 1);
    }, remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current -= Date.now() - started;
    };
  }, [active, visit, paused, reduced]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Octonote AI features"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(active + 1);
        if (e.key === "ArrowLeft") go(active - 1);
      }}
      className="relative outline-none"
    >
      <div className="overflow-hidden">
        <div
          className="ease-emphasized flex transition-transform duration-700 motion-reduce:transition-none"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {SLIDES.map(({ title, body, Demo }, i) => (
            <div
              key={title}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${title}`}
              aria-hidden={i !== active}
              className={cn(
                "w-full shrink-0 transition-opacity duration-700",
                i === active ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="flex h-[350px] items-center lg:h-[400px]">
                <div className="w-full">
                  <Demo key={i === active ? `on-${visit}` : "off"} />
                </div>
              </div>
              <h2 className="text-foreground-strong mt-6 lg:mt-10 text-3xl leading-[1.15] font-bold tracking-tight xl:text-4xl">
                {title}
              </h2>
              <p className="text-muted-foreground mt-3 max-w-lg text-lg">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-2">
        {SLIDES.map(({ title }, i) => (
          <button
            key={title}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show slide ${i + 1}: ${title}`}
            aria-current={i === active}
            className={cn(
              "relative h-1.5 overflow-hidden rounded-full transition-all duration-500",
              i === active
                ? "bg-foreground/20 w-10"
                : "bg-foreground/20 hover:bg-foreground/40 w-1.5",
            )}
          >
            {i === active ? (
              <span
                key={visit}
                className="bg-foreground-strong absolute inset-0 origin-left"
                style={
                  reduced
                    ? undefined
                    : {
                        animation: `progress-fill ${SLIDE_MS}ms linear both`,
                        animationPlayState: paused ? "paused" : "running",
                      }
                }
              />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ───────────── Compact demos sized for the panel ───────────── */

function NotesCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(8);
  return (
    <div ref={ref}>
      <DemoWindow
        title="Launch plan"
        bodyClassName="h-[300px] px-6 py-5 lg:h-[340px] lg:px-8 lg:py-7"
      >
        <p className="text-foreground-subtle text-xs font-semibold tracking-wider uppercase">
          Note
        </p>
        <h3 className="text-foreground-strong mt-3 h-10 text-3xl font-bold tracking-tight">
          <Typed text="Launch plan" active={step >= 1} done={step >= 2} />
        </h3>
        <div className="mt-5 space-y-3">
          {[92, 80, 56].map((w, i) => (
            <div
              key={w}
              className="bg-muted ease-emphasized h-2.5 rounded-full transition-[width] duration-700"
              style={{ width: step >= 2 + i ? `${w}%` : "0%" }}
            />
          ))}
        </div>
        <Reveal show={step >= 5} className="mt-5 space-y-3 lg:mt-7">
          <Todo done={step >= 6}>Invite the design team</Todo>
          <Todo>Publish the field guide</Todo>
        </Reveal>
      </DemoWindow>
    </div>
  );
}

function Todo({ done, children }: { done?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-base">
      <span
        className={cn(
          "grid size-5 place-items-center rounded-md border-[1.5px] transition-colors duration-300",
          done
            ? "bg-foreground-strong border-foreground-strong text-background"
            : "border-foreground-strong",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span
        className={cn(
          "transition-colors duration-300",
          done && "text-foreground-subtle line-through",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** A coding agent's terminal over the Octonote item it saved or read. */
function AgentCard({
  title,
  step,
  lines,
  item,
  showItem,
}: {
  title: string;
  step: number;
  lines: ReactNode;
  item: { icon: typeof FileText; title: string; meta: string };
  showItem: boolean;
}) {
  const Icon = item.icon;
  return (
    <DemoWindow
      title={title}
      bodyClassName="flex h-[300px] flex-col lg:h-[340px]"
    >
      <div className="bg-muted/30 text-foreground [&_.animate-pulse]:bg-foreground flex min-h-0 flex-1 flex-col justify-end space-y-2 overflow-hidden px-5 py-4 text-left font-mono text-[12px] leading-relaxed lg:px-6 lg:text-[13px]">
        {lines}
      </div>
      <div
        className={cn(
          "flex items-center gap-3 border-t px-5 py-3.5 text-sm transition-colors duration-500 lg:px-6",
          showItem ? "bg-muted/40" : "",
        )}
        data-step={step}
      >
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span
          className={cn(
            "truncate font-medium transition-opacity duration-500",
            showItem ? "text-foreground-strong opacity-100" : "opacity-0",
          )}
        >
          {item.title}
        </span>
        <span
          className={cn(
            "text-muted-foreground ml-auto shrink-0 text-xs transition-opacity duration-500",
            showItem ? "opacity-100" : "opacity-0",
          )}
        >
          {item.meta}
        </span>
      </div>
    </DemoWindow>
  );
}

function ClaudeCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(6);
  return (
    <div ref={ref}>
      <AgentCard
        title="Claude Code"
        step={step}
        showItem={step >= 5}
        item={{ icon: FolderKanban, title: "Auth flow", meta: "Research · just now" }}
        lines={
          <>
            <p className="text-foreground-strong">
              <span className="text-muted-foreground">&gt; </span>
              <Typed
                text="Save the auth flow to Octonote, with a diagram"
                active={step >= 1}
                done={step >= 2}
              />
            </p>
            <Reveal show={step >= 2}>
              <AgentTool name="Write" arg="auth.md" />
              <AgentTool name="Write" arg="auth.mmd" />
            </Reveal>
            <Reveal show={step >= 3}>
              <p className="break-words">
                <span className="text-foreground-strong">⏺ Bash</span>
                (octonote project create &quot;Auth flow&quot; --note auth.md
                --canvas-mermaid auth.mmd)
              </p>
            </Reveal>
            <Reveal show={step >= 4}>
              <p className="font-sans text-[13px] lg:text-sm">
                <span className="text-foreground-strong">⏺ </span>
                Saved “Auth flow” to Research, with the diagram.
              </p>
            </Reveal>
          </>
        }
      />
    </div>
  );
}

function CodexCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(6);
  return (
    <div ref={ref}>
      <AgentCard
        title="Codex"
        step={step}
        showItem={step >= 3}
        item={{ icon: FileText, title: "Rate limits: decision", meta: "found in Research" }}
        lines={
          <>
            <p className="text-foreground-strong">
              <span className="text-muted-foreground">› </span>
              <Typed
                text="What did we decide about rate limits?"
                active={step >= 1}
                done={step >= 2}
              />
            </p>
            <Reveal show={step >= 2}>
              <p>
                <span className="text-foreground-strong">• Ran</span>{" "}
                octonote search &quot;rate limit&quot;
              </p>
              <p>
                <span className="text-foreground-strong">• Ran</span> octonote
                note show pag_r4t3…
              </p>
            </Reveal>
            <Reveal show={step >= 4}>
              <p className="font-sans text-[13px] lg:text-sm">
                A token bucket: 100 requests a minute per user, then a 429
                with Retry-After.
              </p>
            </Reveal>
          </>
        }
      />
    </div>
  );
}

function AgentTool({ name, arg }: { name: string; arg: string }) {
  return (
    <p>
      <span className="text-foreground-strong">⏺ {name}</span>({arg})
    </p>
  );
}
