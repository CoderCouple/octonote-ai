"use client";

import {
  Columns2,
  FileText,
  FolderKanban,
  Group,
  LayoutGrid,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

/**
 * The project story in split view, one beat per step:
 * write  — 1 heading · 2–3 paragraph (typing needs two steps)
 * draw   — 4 Browser → App · 5 Redis + Database
 * group  — 6 select the shapes · 7 group into a figure
 * drag   — 8–9 drag the figure by its title bar into the note · 10 embedded
 * sync   — 11 add a CDN on the canvas; the note's figure updates (hold)
 */
const STEPS = 12;

export function ProjectDemo() {
  const { ref, step, reduced } = useDemoStep<HTMLDivElement>(STEPS);
  const drawn = step >= 5 ? 2 : step >= 4 ? 1 : 0;
  const selecting = step === 6;
  const grouped = step >= 7;
  const dragging = step === 8 || step === 9;
  const embedded = step >= 10;
  const edited = step >= 11;

  // The drag chip starts on the figure's title bar and glides into the note.
  const [chipMoved, setChipMoved] = useState(false);
  useEffect(() => {
    if (!dragging || reduced) return setChipMoved(false);
    const id = setTimeout(() => setChipMoved(true), 120);
    return () => clearTimeout(id);
  }, [dragging, reduced]);

  return (
    <div ref={ref}>
      <DemoWindow
        title="Octonote AI — How a URL shortener works"
        bodyClassName="flex h-[460px] flex-col md:h-[580px]"
      >
        {/* Matches the app's project header: name left, view switcher centred (icons only), Share right. */}
        <div className="relative flex h-12 items-center border-b px-5">
          <span className="text-foreground-strong flex min-w-0 items-center gap-2 text-sm font-medium">
            <FolderKanban className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate max-sm:hidden">
              How a URL shortener works
            </span>
          </span>
          <div className="bg-background absolute left-1/2 inline-flex -translate-x-1/2 overflow-hidden rounded-md border">
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
          <span className="ml-auto rounded-md border px-3 py-1 text-xs font-medium">
            Share
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1">
          {/* Note */}
          <div className="w-1/2 overflow-hidden border-r">
            <div className="mx-auto max-w-xl px-6 py-6 text-left md:px-10">
              <h3 className="text-foreground-strong min-h-9 text-2xl font-bold md:min-h-10 md:text-3xl">
                <Typed
                  text="The redirect path"
                  active={step >= 1}
                  done={step >= 2}
                />
              </h3>
              <p className="text-foreground mt-3 min-h-14 text-base md:text-lg">
                <Typed
                  text="One cache lookup. Misses go to the database."
                  active={step >= 2}
                  done={step >= 4}
                />
              </p>
              <div
                className={cn(
                  "mt-4 rounded-xl transition-colors duration-300",
                  dragging &&
                    chipMoved &&
                    "bg-accent/60 outline-foreground-subtle outline-2 outline-dashed",
                )}
              >
                {embedded ? (
                  <Reveal show>
                    <div className="overflow-hidden rounded-xl border">
                      <div className="bg-muted/40 grid h-28 place-items-center md:h-36">
                        <Architecture
                          drawn={2}
                          cdn={edited}
                          className="h-20 w-52 md:h-28 md:w-72"
                        />
                      </div>
                      <div className="flex items-center gap-2 border-t px-4 py-2 text-sm">
                        <Group className="text-muted-foreground size-4" />
                        <span className="font-medium">Architecture</span>
                        <span className="text-muted-foreground ml-auto max-md:hidden">
                          {edited ? "Updated from canvas" : "See on canvas →"}
                        </span>
                      </div>
                    </div>
                  </Reveal>
                ) : (
                  <div className="h-16" />
                )}
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="bg-muted/20 relative w-1/2 overflow-hidden">
            <div className="grid h-full place-items-center p-6">
              <div className="relative">
                <div
                  className={cn(
                    "bg-popover absolute -top-12 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap shadow-md transition-all duration-300",
                    selecting ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <Group className="size-3.5" /> Group as figure
                </div>
                <div
                  className={cn(
                    "rounded-xl border-2 p-3 transition-all duration-500",
                    selecting && "border-foreground-subtle border-dashed",
                    grouped &&
                      "border-foreground-strong bg-background/60 border-solid",
                    !selecting && !grouped && "border-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-1.5 text-left text-xs font-medium transition-opacity duration-300",
                      grouped ? "opacity-100" : "opacity-0",
                    )}
                  >
                    <Group className="size-3.5" /> Architecture
                    <span className="text-muted-foreground ml-auto font-normal">
                      ⠿ drag
                    </span>
                  </div>
                  <Architecture
                    drawn={drawn}
                    cdn={edited}
                    className="h-36 w-64 md:h-48 md:w-80"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Drag chip: from the figure's title bar (canvas) into the note */}
          <div
            className={cn(
              "bg-foreground-strong text-background pointer-events-none absolute z-20 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg transition-all ease-in-out",
              dragging ? "opacity-100" : "opacity-0",
              chipMoved
                ? "top-[48%] left-[14%] duration-[1100ms]"
                : "top-[22%] left-[62%] duration-0",
            )}
          >
            ⧉ Architecture
          </div>
        </div>
      </DemoWindow>
    </div>
  );
}

/**
 * The drawing. `drawn` reveals it stroke by stroke (0 none · 1 Browser → App ·
 * 2 everything); `cdn` adds the box drawn after embedding, to show the sync.
 */
function Architecture({
  drawn,
  cdn,
  className,
}: {
  drawn: 0 | 1 | 2;
  cdn: boolean;
  className?: string;
}) {
  const part = (visible: boolean) =>
    cn(
      "transition-opacity duration-500",
      visible ? "opacity-100" : "opacity-0",
    );
  return (
    <svg
      viewBox="0 0 300 150"
      className={cn("text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <g className={part(drawn >= 1)}>
        <ellipse cx="35" cy="75" rx="30" ry="18" />
        <rect x="100" y="57" width="70" height="36" rx="7" />
        <path d="M65 75h33m-5-3 5 3-5 3" />
        <g fontSize="11" fill="currentColor" stroke="none">
          <text x="35" y="79" textAnchor="middle">
            Browser
          </text>
          <text x="135" y="79" textAnchor="middle">
            App
          </text>
        </g>
      </g>
      <g className={part(drawn >= 2)}>
        <rect x="205" y="17" width="80" height="34" rx="7" />
        <rect x="205" y="97" width="80" height="34" rx="7" />
        <path d="M170 67l33-25m-6 1 6-1-2 6M170 83l33 26m-6 0 6 1-1-6" />
        <g fontSize="11" fill="currentColor" stroke="none">
          <text x="245" y="39" textAnchor="middle">
            Redis
          </text>
          <text x="245" y="119" textAnchor="middle">
            Database
          </text>
        </g>
      </g>
      <g className={part(cdn)}>
        <rect
          x="10"
          y="118"
          width="52"
          height="26"
          rx="6"
          strokeDasharray="3 3"
        />
        <text
          x="36"
          y="135"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
          stroke="none"
        >
          CDN
        </text>
        <path d="M35 93v23" strokeDasharray="3 3" />
      </g>
    </svg>
  );
}
