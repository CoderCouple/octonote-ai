"use client";

import { BookOpen, CheckSquare, FileText, Heading1, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

const BULLETS = ["Invite the design team", "Publish the field guide", "Ship iOS and Android"];
const PAGES = ["Launch plan", "Field guide", "Weekly sync", "Reading list"];

/** Writing a note, then `/canvas` dropping a canvas preview into it. */
export function NotesDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(9);
  const slash = step === 6;
  const card = step >= 7;

  return (
    <div ref={ref}>
      <DemoWindow title="Octonote AI — Launch plan" bodyClassName="flex h-[400px] md:h-[560px]">
        <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
          <p className="text-muted-foreground mb-3 px-2 text-xs font-medium">Notes</p>
          {PAGES.map((p, i) => (
            <div
              key={p}
              className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px]", i === 0 && "bg-accent font-medium")}
            >
              <FileText className="text-muted-foreground size-4" />
              {p}
            </div>
          ))}
          <p className="text-muted-foreground mt-6 mb-3 px-2 text-xs font-medium">Notebooks</p>
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px]">
            <BookOpen className="text-muted-foreground size-4" />
            Q3 launch
          </div>
        </aside>

        <div className="relative flex-1 px-8 py-10 md:px-16">
          <h3 className="text-foreground-strong min-h-12 text-4xl font-bold tracking-tight">
            <Typed text="Launch plan" active={step >= 1} done={step >= 2} />
          </h3>
          <p className="text-foreground mt-5 min-h-7 text-lg">
            <Typed text="Notes and canvases, shipped together." active={step >= 2} done={step >= 3} />
          </p>
          <ul className="mt-4 space-y-2">
            {BULLETS.map((b, i) => (
              <Reveal key={b} show={step >= 3 + i}>
                <li className="text-foreground flex items-center gap-3 text-lg">
                  <span className="border-foreground-subtle size-4 rounded-[4px] border-[1.5px]" />
                  {b}
                </li>
              </Reveal>
            ))}
          </ul>

          <div className="relative mt-4 h-8">
            {slash ? (
              <p className="text-foreground text-lg">
                <Typed text="/canvas" active done={false} />
              </p>
            ) : null}
            <div
              className={cn(
                "bg-popover absolute top-9 left-0 z-10 w-64 rounded-lg border p-1.5 shadow-lg transition-all duration-300 ease-standard",
                slash ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
              )}
            >
              {[
                { icon: Heading1, label: "Heading" },
                { icon: List, label: "Bulleted list" },
                { icon: CheckSquare, label: "To-do list" },
                { icon: LayoutGrid, label: "Canvas", active: true },
              ].map(({ icon: Icon, label, active }) => (
                <div
                  key={label}
                  className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[15px]", active && "bg-accent")}
                >
                  <Icon className="text-muted-foreground size-4" />
                  {label}
                </div>
              ))}
            </div>
            <Reveal show={card} className="absolute top-0 left-0 w-full max-w-lg">
              <div className="overflow-hidden rounded-xl border">
                <div className="bg-muted grid h-40 place-items-center">
                  <MiniDiagram />
                </div>
                <div className="flex items-center gap-2.5 px-4 py-3 text-base font-medium">
                  <LayoutGrid className="size-4" />
                  Launch flow
                  <span className="text-muted-foreground ml-auto text-sm">Open →</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </DemoWindow>
    </div>
  );
}

function MiniDiagram() {
  return (
    <svg viewBox="0 0 200 70" className="text-foreground h-24 w-72" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="6" y="20" width="46" height="28" rx="6" />
      <rect x="77" y="20" width="46" height="28" rx="6" />
      <ellipse cx="171" cy="34" rx="23" ry="15" />
      <path d="M52 34h22m-4-3 4 3-4 3M123 34h22m-4-3 4 3-4 3" />
    </svg>
  );
}
