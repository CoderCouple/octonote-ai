"use client";

/**
 * The auth panel's feature tour — the web twin of the mobile onboarding:
 * one card per feature, each a live animation, auto-advancing with
 * story-style progress dots. Hover pauses; dots jump; arrow keys work.
 * With reduced motion it never auto-advances.
 */
import {
  BookOpen,
  Check,
  FileText,
  FolderKanban,
  LayoutGrid,
} from "lucide-react";
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
    title: "Share like a doc. Publish like a site.",
    body: "Invite people as editors or viewers, or publish a clean public page in one click.",
    Demo: ShareCard,
  },
  {
    title: "Group it. Share it all at once.",
    body: "Collect notes, canvases and projects in a notebook. Share or publish it once and everything inside follows.",
    Demo: NotebookCard,
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

function ShareCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(8);
  const published = step >= 4;
  return (
    <div ref={ref}>
      <DemoWindow
        title="Share “Field guide”"
        bodyClassName="h-[300px] px-6 py-5 lg:h-[340px] lg:px-8 lg:py-7"
      >
        <div className="space-y-3">
          <Person initial="Y" name="You" role="Owner" />
          <Reveal show={step >= 1}>
            <Person initial="M" name="Maya" role="Editor" />
          </Reveal>
          <Reveal show={step >= 2}>
            <Person initial="S" name="Sam" role="Viewer" />
          </Reveal>
        </div>
        <div className="my-4 border-t lg:my-6" />
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-foreground-strong text-base font-medium">
              Publish to web
            </p>
            <p
              className={cn(
                "text-muted-foreground text-sm transition-opacity duration-500",
                published ? "opacity-100" : "opacity-0",
              )}
            >
              Live · anyone can read
            </p>
          </div>
          <div
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors duration-300",
              published ? "bg-primary" : "bg-input",
            )}
          >
            <div
              className={cn(
                "bg-background ease-emphasized absolute top-0.5 size-5 rounded-full shadow-sm transition-transform duration-300",
                published ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </div>
        </div>
        <Reveal show={step >= 5} className="mt-5">
          <div className="bg-muted flex items-center gap-2 rounded-lg px-3.5 py-2.5 font-mono text-sm">
            octonote.ai/pub/field-guide
            <Check className="ml-auto size-4" />
          </div>
        </Reveal>
      </DemoWindow>
    </div>
  );
}

function Person({
  initial,
  name,
  role,
}: {
  initial: string;
  name: string;
  role: string;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="bg-foreground-strong text-background grid size-9 place-items-center rounded-full text-sm font-semibold">
        {initial}
      </div>
      <span className="text-foreground-strong flex-1 text-base font-medium">
        {name}
      </span>
      <span className="text-muted-foreground text-sm">{role}</span>
    </div>
  );
}

const NOTEBOOK_ITEMS = [
  { icon: FileText, title: "Roadmap", kind: "Note" },
  { icon: LayoutGrid, title: "Launch flow", kind: "Canvas" },
  { icon: FolderKanban, title: "Onboarding", kind: "Project" },
];

function NotebookCard() {
  const { ref, step } = useDemoStep<HTMLDivElement>(7);
  const published = step >= 4;
  return (
    <div ref={ref}>
      <DemoWindow
        title="Notebooks"
        bodyClassName="h-[300px] px-6 py-5 lg:h-[340px] lg:px-8 lg:py-7"
      >
        <div className="mb-4 flex items-center gap-4 lg:mb-5">
          <div className="bg-muted grid size-12 place-items-center rounded-xl border">
            <BookOpen className="size-6" />
          </div>
          <div className="flex-1">
            <p className="text-foreground-strong text-xl font-bold tracking-tight">
              Field guide
            </p>
            <p className="text-muted-foreground text-sm">
              {Math.min(step, 3)} items
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-all duration-500",
              published
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground",
            )}
          >
            {published ? "Published" : "Private"}
          </span>
        </div>
        <ul className="divide-y rounded-xl border">
          {NOTEBOOK_ITEMS.map(({ icon: Icon, title, kind }, i) => (
            <Reveal key={title} show={step >= i + 1}>
              <li className="flex h-11 items-center gap-3.5 px-4 lg:h-14">
                <Icon className="text-muted-foreground size-4.5" />
                <span className="flex-1 text-base font-medium">{title}</span>
                <span
                  className={cn(
                    "text-muted-foreground hidden text-xs transition-opacity duration-500 sm:inline",
                    published ? "opacity-100" : "opacity-0",
                  )}
                  style={{
                    transitionDelay: published ? `${i * 160}ms` : "0ms",
                  }}
                >
                  Public via Field guide
                </span>
                <span className="text-foreground-subtle w-14 text-right text-sm">
                  {kind}
                </span>
              </li>
            </Reveal>
          ))}
        </ul>
      </DemoWindow>
    </div>
  );
}
