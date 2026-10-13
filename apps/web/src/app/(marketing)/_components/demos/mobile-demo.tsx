"use client";

import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  Columns2,
  FileText,
  FolderKanban,
  Home,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  Share,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Typed } from "./typed";
import { useDemoStep } from "./use-demo-step";

type Platform = "ios" | "android";

const TABS = [
  { icon: Home, label: "Home" },
  { icon: FileText, label: "Notes" },
  { icon: LayoutGrid, label: "Canvases" },
  { icon: FolderKanban, label: "Projects" },
  { icon: BookOpen, label: "Notebooks" },
];

const NOTES = [
  "The Transformer",
  "Rate limiter",
  "Bayes' theorem",
  "Git workflow",
  "TCP vs UDP",
];

/**
 * The native apps as they are (app structure decided 2026-10-12): five tabs,
 * compact centred titles with the avatar left and + right, search + "Shared
 * with you" on Home, items open full screen (back · title · Share · ⋯),
 * lists toggle to a grid. iPhone and Android side by side, each with its
 * own native details.
 *
 * 0 Home · 1 Notes tab · 2 tap a note · 3–4 open, typing · 5 back ·
 * 6 grid view (hold)
 */
export function MobileDemo() {
  const { ref, step } = useDemoStep<HTMLDivElement>(7);
  return (
    <div
      ref={ref}
      aria-hidden
      className="flex justify-center gap-10 select-none md:gap-16"
    >
      <Phone platform="ios" step={step} />
      <Phone platform="android" step={step} className="hidden md:block" />
    </div>
  );
}

function Phone({
  platform,
  step,
  className,
}: {
  platform: Platform;
  step: number;
  className?: string;
}) {
  const ios = platform === "ios";
  const tab = step === 0 ? 0 : 1;
  const tapped = step === 2;
  const open = step >= 3 && step <= 4;
  const grid = step >= 6;

  return (
    <div className={cn("w-[300px] md:w-[320px]", className)}>
      <div
        className={cn(
          "bg-card relative h-[640px] overflow-hidden border-[8px] border-[var(--foreground-strong)] shadow-lg",
          ios ? "rounded-[3rem]" : "rounded-[2.2rem]",
        )}
      >
        {/* Dynamic Island / punch-hole camera */}
        {ios ? (
          <div className="absolute top-2.5 left-1/2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]" />
        ) : (
          <div className="absolute top-3 left-1/2 z-30 size-3.5 -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]" />
        )}

        {/* ---------- Tab screens ---------- */}
        <div
          className={cn(
            "ease-emphasized absolute inset-0 flex flex-col pt-11 transition-transform duration-500",
            open ? "-translate-x-1/3" : "translate-x-0",
          )}
        >
          <Header title={TABS[tab]!.label} />

          {tab === 0 ? (
            <HomeScreen />
          ) : (
            <div className="flex-1 overflow-hidden">
              <div className="text-muted-foreground flex items-center justify-end gap-2 px-4 pb-2">
                <LayoutList
                  className={cn("size-4", !grid && "text-foreground-strong")}
                />
                <LayoutGrid
                  className={cn("size-4", grid && "text-foreground-strong")}
                />
              </div>
              {grid ? (
                <div className="grid grid-cols-2 gap-3 px-4">
                  {NOTES.slice(0, 4).map((n) => (
                    <div key={n} className="overflow-hidden rounded-xl border">
                      <div className="bg-muted/50 space-y-1.5 px-3 pt-3 pb-4">
                        <div className="bg-foreground/15 h-1.5 w-4/5 rounded" />
                        <div className="bg-foreground/10 h-1.5 w-3/5 rounded" />
                        <div className="bg-foreground/10 h-1.5 w-2/3 rounded" />
                      </div>
                      <p className="truncate px-3 py-2 text-sm font-medium">
                        {n}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <ul>
                  {NOTES.map((n, i) => (
                    <li
                      key={n}
                      className={cn(
                        "flex items-center gap-3 border-b px-4 py-3.5 transition-colors duration-200",
                        i === 0 && tapped && "bg-accent",
                      )}
                    >
                      <FileText className="text-muted-foreground size-5" />
                      <span className="text-base font-medium">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <TabBar platform={platform} active={tab} />
        </div>

        {/* ---------- Opened note: full screen, bar hidden ---------- */}
        <div
          className={cn(
            "bg-card ease-emphasized absolute inset-0 z-10 flex flex-col pt-11 shadow-lg transition-transform duration-500",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center gap-2 border-b px-3 pb-3">
            {ios ? (
              <ChevronLeft className="size-6" />
            ) : (
              <ArrowLeft className="size-5" />
            )}
            <span className="flex-1 truncate text-base font-semibold">
              The Transformer
            </span>
            <Share className="size-4" />
            <MoreHorizontal className="size-5" />
          </div>
          <div className="space-y-3 px-5 pt-5 text-left">
            <p className="text-foreground-strong text-2xl font-bold tracking-tight">
              The Transformer
            </p>
            <p className="text-base">
              Every token decides how much to listen to every other token.
            </p>
            <div className="bg-muted/40 grid h-28 place-items-center rounded-xl border">
              <Columns2 className="text-muted-foreground size-6" />
            </div>
            <p className="text-base">
              <Typed
                text="Drafted on the train home."
                active={step >= 3}
                done={step >= 4}
              />
            </p>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        {ios ? "iPhone" : "Android"}
      </p>
    </div>
  );
}

/** Compact header on every tab: avatar left, centred title, + right. */
function Header({ title }: { title: string }) {
  return (
    <div className="relative flex h-11 items-center px-4">
      <span className="bg-foreground-strong text-background grid size-7 place-items-center rounded-full text-xs font-semibold">
        S
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">
        {title}
      </span>
      <Plus className="ml-auto size-5" />
    </div>
  );
}

function HomeScreen() {
  return (
    <div className="flex-1 space-y-4 overflow-hidden px-4 pt-1 text-left">
      <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <Search className="size-4" /> Search
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          Shared with you
          <span className="bg-foreground-strong size-1.5 rounded-full" />
          <span className="text-muted-foreground ml-auto text-xs font-normal">
            View all
          </span>
        </p>
        <div className="mt-2 flex gap-2.5">
          {["Q4 roadmap", "Infra map"].map((t) => (
            <div
              key={t}
              className="w-32 shrink-0 overflow-hidden rounded-xl border"
            >
              <div className="bg-muted/50 h-14" />
              <p className="truncate px-2.5 py-1.5 text-xs font-medium">{t}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">Recent</p>
        <ul className="mt-1">
          {NOTES.slice(0, 3).map((n) => (
            <li
              key={n}
              className="flex items-center gap-2.5 border-b py-2.5 text-sm"
            >
              <FileText className="text-muted-foreground size-4" />
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** iOS: floating tab bar with labels. Android: Material bottom bar with a pill indicator. */
function TabBar({ platform, active }: { platform: Platform; active: number }) {
  if (platform === "ios") {
    return (
      <div className="bg-background/90 mx-3 mb-4 flex justify-around rounded-full border px-1 py-1.5 shadow-md">
        {TABS.map(({ icon: Icon, label }, i) => (
          <span
            key={label}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-full px-2 py-1 text-[9px]",
              i === active
                ? "bg-accent text-foreground-strong"
                : "text-foreground-subtle",
            )}
          >
            <Icon className="size-4" />
            {label}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="bg-muted/60 flex justify-around border-t px-1 pt-2 pb-4">
      {TABS.map(({ icon: Icon, label }, i) => (
        <span
          key={label}
          className={cn(
            "flex flex-col items-center gap-1 text-[9px]",
            i === active
              ? "text-foreground-strong font-medium"
              : "text-foreground-subtle",
          )}
        >
          <span
            className={cn(
              "grid h-6 w-11 place-items-center rounded-full",
              i === active && "bg-accent",
            )}
          >
            <Icon className="size-4" />
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}
