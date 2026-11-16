"use client";

/**
 * The auth panel's feature tour — the web twin of the mobile onboarding:
 * one card per feature, each a live animation, auto-advancing with
 * story-style progress dots. Hover pauses; dots jump; arrow keys work.
 * With reduced motion it never auto-advances.
 */
import { ArrowUpRight, Check, FileText, FolderKanban, Shapes } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OctopusMark } from "@/components/octopus-mark";
import {
  DemoWindow,
  Reveal,
} from "@/app/(marketing)/_components/demos/demo-window";
import { Typed } from "@/app/(marketing)/_components/demos/typed";
import { useDemoStep } from "@/app/(marketing)/_components/demos/use-demo-step";
import { cn } from "@/lib/utils";

const SLIDE_MS = 8000;

/** Loaded in the browser only: it brings the widgets library, which the rest of the page doesn't need. */
const CircleWidgetCard = dynamic(() => import("./circle-widget-card").then((m) => m.CircleWidgetCard), {
  ssr: false,
  loading: () => <div className="bg-card h-[340px] rounded-2xl border shadow-lg" aria-hidden />,
});

const SLIDES: { title: string; body: string; Demo: React.ComponentType }[] = [
  {
    title: "Notes you can play with.",
    body: "Put widgets, quizzes, flashcards, mind maps and animations in any note. Drag the point to try one.",
    Demo: CircleWidgetCard,
  },
  {
    title: "Now inside Claude and ChatGPT.",
    body: "Connect once and ask in the chat: answers become real notes and editable canvases. Gemini is coming soon.",
    Demo: ChatCard,
  },
  {
    title: "Claude Code saves it for you.",
    body: "Ask Claude Code to write up what you figured out. It lands in Octonote as a note with a real diagram.",
    Demo: ClaudeCard,
  },
  {
    title: "Codex finds it next week.",
    body: "Codex reads your notes too, so a new session starts from what you already decided.",
    Demo: CodexCard,
  },
  {
    title: "Gemini CLI draws it.",
    body: "Ask Gemini CLI for a diagram and it becomes a real, editable Octonote canvas.",
    Demo: GeminiCard,
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

/** Asking Claude in the chat; the Octonote connector saves the note. */
function ChatCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(6);
  return (
    <div ref={ref}>
      <DemoWindow title="claude.ai" bodyClassName="flex h-[300px] flex-col justify-end gap-3 bg-[#faf9f5] px-5 py-4 text-left text-[13px] text-[#3d3929] lg:h-[340px] dark:bg-[#262624] dark:text-[#e8e6dc]">
        <div className="ml-auto max-w-[85%] rounded-xl bg-[#f0eee6] px-3.5 py-2 dark:bg-[#141413]">
          <Typed text="Write up our caching plan as an Octonote note, with a diagram" active={step >= 1} done={step >= 2} />
        </div>
        <Reveal show={step >= 2}>
          <div className="flex w-fit items-center gap-2 rounded-lg border border-black/10 bg-white/60 px-3 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5">
            <OctopusMark className="size-4" paper="#faf9f5" />
            <span className="font-medium">Octonote</span>
            <span className="opacity-60">create_project</span>
            {step >= 3 ? <Check className="size-3.5 text-emerald-600" /> : null}
          </div>
        </Reveal>
        <Reveal show={step >= 4} className="space-y-2.5">
          <p className="font-serif text-[14px] leading-relaxed">Done. I saved Caching plan to Research, with a canvas of how a request flows.</p>
          <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#30302e]">
            <FolderKanban className="size-4 opacity-60" />
            <span className="min-w-0 flex-1 truncate font-medium">Caching plan</span>
            <span className="text-[11px] opacity-60">octonote.ai</span>
            <ArrowUpRight className="size-3.5 opacity-60" />
          </div>
        </Reveal>
      </DemoWindow>
    </div>
  );
}

function GeminiCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(6);
  return (
    <div ref={ref}>
      <AgentCard
        title="Gemini CLI"
        step={step}
        showItem={step >= 4}
        item={{ icon: Shapes, title: "Deploy pipeline", meta: "Research · just now" }}
        lines={
          <>
            <p className="text-foreground-strong">
              <span className="text-muted-foreground">&gt; </span>
              <Typed text="Draw our deploy pipeline as an Octonote canvas" active={step >= 1} done={step >= 2} />
            </p>
            <Reveal show={step >= 2}>
              <p className="break-words">
                <span className="text-foreground-strong">✓ Shell</span> octonote canvas create &quot;Deploy pipeline&quot; --from-mermaid deploy.mmd
              </p>
            </Reveal>
            <Reveal show={step >= 3}>
              <p className="font-sans text-[13px] lg:text-sm">
                <span className="text-foreground-strong">✦ </span>
                Drew “Deploy pipeline” in Research: push, tests, build, staging, then production.
              </p>
            </Reveal>
          </>
        }
      />
    </div>
  );
}
