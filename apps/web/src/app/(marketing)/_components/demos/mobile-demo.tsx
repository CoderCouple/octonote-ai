"use client";

import { BookOpen, ChevronLeft, FileText, FolderKanban, LayoutGrid, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

const NOTES = ["Launch plan", "Field guide", "Weekly sync", "Reading list"];

/** The native mobile app: a large-title list, tap a note, it opens; swipe back. */
export function MobileDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(6);
  const tapped = step === 1;
  const open = step >= 2 && step <= 4;

  return (
    <div ref={ref} aria-hidden className="mx-auto w-[340px] select-none">
      <div className="bg-card relative h-[690px] overflow-hidden rounded-[3rem] border-[8px] border-[var(--foreground-strong)] shadow-lg">
        <div className="absolute top-2.5 left-1/2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]" />

        {/* List screen */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col pt-12 transition-transform duration-500 ease-emphasized",
            open ? "-translate-x-1/3" : "translate-x-0",
          )}
        >
          <div className="flex items-center justify-between px-5">
            <span className="text-muted-foreground text-sm">Account</span>
            <Plus className="size-5" />
          </div>
          <p className="text-foreground-strong px-5 pt-3 pb-4 text-4xl font-bold tracking-tight">Notes</p>
          <ul className="flex-1">
            {NOTES.map((n, i) => (
              <li
                key={n}
                className={cn(
                  "flex items-center gap-3.5 border-b px-5 py-4 transition-colors duration-200",
                  i === 0 && tapped && "bg-accent",
                )}
              >
                <div className="bg-muted grid size-11 place-items-center rounded-lg border">
                  <FileText className="text-muted-foreground size-5" />
                </div>
                <span className="text-lg font-medium">{n}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-around border-t py-4">
            {[FileText, LayoutGrid, FolderKanban, BookOpen, Users].map((Icon, i) => (
              <Icon key={i} className={cn("size-6", i === 0 ? "text-foreground-strong" : "text-foreground-subtle")} />
            ))}
          </div>
        </div>

        {/* Note screen */}
        <div
          className={cn(
            "bg-card absolute inset-0 flex flex-col pt-12 shadow-lg transition-transform duration-500 ease-emphasized",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center gap-1.5 border-b px-4 pb-3.5">
            <ChevronLeft className="size-6" />
            <span className="text-lg font-medium">Launch plan</span>
          </div>
          <div className="space-y-3 px-5 pt-6">
            <p className="text-foreground-strong text-3xl font-bold tracking-tight">Launch plan</p>
            <p className="text-lg">Notes and canvases, shipped together.</p>
            <p className="text-lg">
              <Typed text="Drafted on the train home." active={step >= 3} done={step >= 4} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
