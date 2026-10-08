"use client";

import { BookOpen, FileText, FolderKanban, Globe, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { useDemoStep } from "./use-demo-step";

const ITEMS = [
  { icon: FileText, title: "Roadmap", kind: "Note" },
  { icon: LayoutGrid, title: "Launch flow", kind: "Canvas" },
  { icon: FolderKanban, title: "Onboarding", kind: "Project" },
];

/** Items filed into a notebook; publish the notebook and everything inside goes public with it. */
export function NotebookDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(7);
  const published = step >= 4;

  return (
    <div ref={ref}>
      <DemoWindow title="Notebooks" bodyClassName="p-8 md:p-10" className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="bg-muted grid size-14 place-items-center rounded-xl border">
            <BookOpen className="size-7" />
          </div>
          <div className="flex-1">
            <p className="text-foreground-strong text-2xl font-bold tracking-tight">Field guide</p>
            <p className="text-muted-foreground text-base">{Math.min(step, 3)} items</p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-all duration-500",
              published ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground",
            )}
          >
            <Globe className="size-4" />
            {published ? "Published" : "Private"}
          </span>
        </div>
        <ul className="divide-y rounded-xl border">
          {ITEMS.map(({ icon: Icon, title, kind }, i) => (
            <Reveal key={title} show={step >= i + 1}>
              <li className="flex h-16 items-center gap-4 px-5">
                <Icon className="text-muted-foreground size-5" />
                <span className="flex-1 text-lg font-medium">{title}</span>
                <span
                  className={cn(
                    "text-muted-foreground hidden items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-all duration-500 sm:flex",
                    published ? "opacity-100" : "opacity-0",
                  )}
                  style={{ transitionDelay: published ? `${i * 160}ms` : "0ms" }}
                >
                  <Globe className="size-3.5" />
                  Public via Field guide
                </span>
                <span className="text-foreground-subtle w-20 text-right text-sm">{kind}</span>
              </li>
            </Reveal>
          ))}
        </ul>
        <p
          className={cn(
            "text-muted-foreground mt-6 text-base transition-opacity duration-500",
            step >= 5 ? "opacity-100" : "opacity-0",
          )}
        >
          Shared with your team? Everyone gets the same access to everything inside.
        </p>
      </DemoWindow>
    </div>
  );
}
