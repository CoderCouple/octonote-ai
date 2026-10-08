"use client";

import { Check, ChevronDown, Copy, Globe, Link2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoWindow, Reveal } from "./demo-window";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

/**
 * The share flow end to end: invite a person as Editor, open the link to
 * anyone, then publish — and the public page it produces appears beside it.
 */
export function ShareDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(10);
  const typing = step >= 1;
  const typed = step >= 2;
  const added = step >= 3;
  const anyone = step >= 5;
  const published = step >= 7;

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-2">
      <DemoWindow title="Share “Field guide”" className="flex flex-col" bodyClassName="flex-1 space-y-6 p-7">
        <div className="flex gap-2">
          <div className="flex h-11 flex-1 items-center rounded-lg border px-3.5 text-base">
            {typing && !added ? (
              <Typed text="maya@studio.com" active done={typed} />
            ) : (
              <span className="text-foreground-subtle">Add people by email</span>
            )}
          </div>
          <div className="flex h-11 w-28 items-center justify-between rounded-lg border px-3.5 text-base">
            Editor
            <ChevronDown className="text-muted-foreground size-4" />
          </div>
          <div
            className={cn(
              "bg-primary text-primary-foreground flex h-11 items-center rounded-lg px-5 text-base font-medium transition-transform duration-150",
              step === 2 && "scale-95",
            )}
          >
            Share
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-sm font-medium">People with access</p>
          <Person initials="Y" name="You" detail="you@studio.com" role="Owner" />
          <Reveal show={added}>
            <Person initials="M" name="Maya" detail="maya@studio.com" role="Editor" fresh={step === 3} />
          </Reveal>
        </div>

        <div className="space-y-3 border-t pt-5">
          <p className="text-muted-foreground text-sm font-medium">General access</p>
          <div className="flex items-center gap-3.5">
            <div className="bg-muted grid size-10 place-items-center rounded-full">
              {anyone ? <Link2 className="size-5" /> : <Lock className="size-5" />}
            </div>
            <div className="flex-1">
              <p className="text-base font-medium">{anyone ? "Anyone with the link" : "Restricted"}</p>
              <p className="text-muted-foreground text-sm">
                {anyone ? "Anyone with the link can view" : "Only people with access can open"}
              </p>
            </div>
            <div
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-300",
                step === 4 && "bg-accent",
              )}
            >
              <Copy className="size-3.5" />
              Copy link
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t pt-5">
          <div className="flex items-center gap-3.5">
            <div className="bg-muted grid size-10 place-items-center rounded-full">
              <Globe className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-base font-medium">Publish to web</p>
              <p className="text-muted-foreground text-sm">A clean public page, read-only</p>
            </div>
            <Toggle on={published} />
          </div>
          <Reveal show={published}>
            <div className="bg-muted flex items-center gap-2 rounded-lg px-3.5 py-2.5 font-mono text-sm">
              octonote.app/pub/field-guide
              <Check className="ml-auto size-4" />
            </div>
          </Reveal>
        </div>
      </DemoWindow>

      {/* The published page it produces */}
      <DemoWindow title="octonote.app/pub/field-guide" className="flex flex-col" bodyClassName="min-h-[520px] flex-1">
        <div
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity duration-500",
            published ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="text-center">
            <Lock className="text-foreground-subtle mx-auto size-8" />
            <p className="text-muted-foreground mt-3 text-base">Not published yet</p>
          </div>
        </div>
        <div
          className={cn(
            "px-10 py-12 transition-all duration-700 ease-emphasized",
            published ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          <p className="text-muted-foreground text-sm">4 min read · Updated today</p>
          <h3 className="text-foreground-strong mt-3 text-4xl font-bold tracking-tight">Field guide</h3>
          <p className="text-foreground mt-5 text-lg leading-relaxed">
            Everything a new teammate needs in week one — how we plan, how we draw, and where things live.
          </p>
          <div className="mt-6 space-y-3">
            {[92, 84, 88, 60].map((w, i) => (
              <div key={i} className="bg-muted h-3.5 rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="bg-muted mt-8 grid h-32 place-items-center rounded-xl border">
            <svg viewBox="0 0 200 70" className="text-foreground h-16 w-56" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="6" y="20" width="46" height="28" rx="6" />
              <rect x="77" y="20" width="46" height="28" rx="6" />
              <ellipse cx="171" cy="34" rx="23" ry="15" />
              <path d="M52 34h22m-4-3 4 3-4 3M123 34h22m-4-3 4 3-4 3" />
            </svg>
          </div>
        </div>
      </DemoWindow>
    </div>
  );
}

function Person({
  initials,
  name,
  detail,
  role,
  fresh,
}: {
  initials: string;
  name: string;
  detail: string;
  role: string;
  fresh?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 rounded-lg px-1.5 py-2 transition-colors duration-700", fresh && "bg-accent")}>
      <div className="bg-foreground text-background grid size-10 place-items-center rounded-full text-sm font-semibold">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">{name}</p>
        <p className="text-muted-foreground truncate text-sm">{detail}</p>
      </div>
      <span className="text-muted-foreground text-sm">{role}</span>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={cn("relative h-6 w-11 rounded-full transition-colors duration-300 ease-standard", on ? "bg-primary" : "bg-input")}>
      <div
        className={cn(
          "bg-background absolute top-0.5 size-5 rounded-full shadow-sm transition-transform duration-300 ease-emphasized",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </div>
  );
}
