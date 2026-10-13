"use client";

import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
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
      <DeviceFrame platform={platform}>
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
            <div className="bg-muted/40 grid h-32 place-items-center rounded-xl border">
              <svg
                viewBox="0 0 120 80"
                className="text-foreground h-24 w-36"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <rect x="20" y="62" width="80" height="13" rx="3" />
                <path d="M60 62v-7m-2.5 3 2.5-3 2.5 3" />
                <rect x="20" y="40" width="80" height="15" rx="3" />
                <path d="M60 40v-7m-2.5 3 2.5-3 2.5 3" />
                <rect
                  x="20"
                  y="22"
                  width="80"
                  height="11"
                  rx="3"
                  strokeDasharray="2 2"
                />
                <path d="M60 22v-7m-2.5 3 2.5-3 2.5 3" />
                <rect x="20" y="3" width="80" height="12" rx="3" />
                <g
                  fontSize="6.5"
                  fill="currentColor"
                  stroke="none"
                  textAnchor="middle"
                >
                  <text x="60" y="71">
                    Embeddings
                  </text>
                  <text x="60" y="50">
                    Multi-head attention
                  </text>
                  <text x="60" y="30">
                    Add &amp; norm
                  </text>
                  <text x="60" y="11">
                    Feed-forward
                  </text>
                </g>
              </svg>
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
      </DeviceFrame>
      <p className="text-muted-foreground mt-5 text-center text-sm">
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
      <div className="bg-background/90 mx-3 mb-7 flex justify-around rounded-full border px-1 py-1.5 shadow-md backdrop-blur">
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
    <div className="bg-muted/60 flex justify-around border-t px-1 pt-2 pb-7">
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

/**
 * A realistic device: brushed-metal rim, black bezel, side buttons, status bar
 * (9:41, signal, Wi-Fi, battery), Dynamic Island or punch-hole camera, home
 * indicator / gesture bar and a faint glass reflection. Monochrome tokens only.
 */
function DeviceFrame({
  platform,
  children,
}: {
  platform: Platform;
  children: React.ReactNode;
}) {
  const ios = platform === "ios";
  const rim =
    "bg-gradient-to-b from-[var(--foreground-subtle)] via-[var(--muted)] to-[var(--foreground-subtle)]";
  return (
    <div className="relative">
      {/* Side buttons */}
      {ios ? (
        <>
          <span
            className={cn(
              "absolute top-[112px] -left-[3px] h-7 w-[4px] rounded-l-sm",
              rim,
            )}
          />
          <span
            className={cn(
              "absolute top-[160px] -left-[3px] h-12 w-[4px] rounded-l-sm",
              rim,
            )}
          />
          <span
            className={cn(
              "absolute top-[220px] -left-[3px] h-12 w-[4px] rounded-l-sm",
              rim,
            )}
          />
          <span
            className={cn(
              "absolute top-[180px] -right-[3px] h-20 w-[4px] rounded-r-sm",
              rim,
            )}
          />
        </>
      ) : (
        <>
          <span
            className={cn(
              "absolute top-[130px] -right-[3px] h-16 w-[4px] rounded-r-sm",
              rim,
            )}
          />
          <span
            className={cn(
              "absolute top-[215px] -right-[3px] h-10 w-[4px] rounded-r-sm",
              rim,
            )}
          />
        </>
      )}

      {/* Rim → bezel → screen */}
      <div
        className={cn(
          "p-[3px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45),0_12px_24px_-12px_rgba(0,0,0,0.3)]",
          rim,
          ios ? "rounded-[3.4rem]" : "rounded-[2.6rem]",
        )}
      >
        <div
          className={cn(
            "bg-[var(--foreground-strong)] p-[10px]",
            ios ? "rounded-[3.25rem]" : "rounded-[2.45rem]",
          )}
        >
          <div
            className={cn(
              "bg-card text-card-foreground relative h-[620px] overflow-hidden md:h-[640px]",
              ios ? "rounded-[2.6rem]" : "rounded-[1.9rem]",
            )}
          >
            {children}

            {/* Status bar */}
            <div
              className={cn(
                "text-foreground-strong pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between text-[13px] font-semibold",
                ios ? "px-7" : "px-5",
              )}
            >
              <span>9:41</span>
              <span className="flex items-center gap-1.5">
                <svg
                  viewBox="0 0 18 12"
                  className="h-[10px] w-[16px]"
                  fill="currentColor"
                >
                  <rect x="0" y="8" width="3" height="4" rx="0.8" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                  <rect x="10" y="3" width="3" height="9" rx="0.8" />
                  <rect x="15" y="0" width="3" height="12" rx="0.8" />
                </svg>
                <svg
                  viewBox="0 0 16 12"
                  className="h-[10px] w-[14px]"
                  fill="currentColor"
                >
                  <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3C13.5 1.6 10.9.5 8 .5S2.5 1.6.5 3.4l1.2 1.3C3.4 3.1 5.6 2.2 8 2.2zm0 3.4c1.5 0 2.9.6 3.9 1.5l1.2-1.3C11.8 4.6 10 3.9 8 3.9s-3.8.7-5.1 1.9l1.2 1.3c1-.9 2.4-1.5 3.9-1.5zm0 3.4c.6 0 1.2.2 1.6.6L8 11.5 6.4 9.6c.4-.4 1-.6 1.6-.6z" />
                </svg>
                <span className="relative flex h-[11px] w-[22px] items-center rounded-[3px] border border-current p-[1.5px] opacity-90">
                  <span className="h-full w-[75%] rounded-[1.5px] bg-current" />
                  <span className="absolute top-1/2 -right-[3px] h-[4px] w-[1.5px] -translate-y-1/2 rounded-r bg-current" />
                </span>
              </span>
            </div>

            {/* Dynamic Island / punch-hole camera */}
            {ios ? (
              <div className="absolute top-[9px] left-1/2 z-40 h-[30px] w-[100px] -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]" />
            ) : (
              <div className="absolute top-[13px] left-1/2 z-40 size-[13px] -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]" />
            )}

            {/* Home indicator / gesture bar */}
            <div
              className={cn(
                "pointer-events-none absolute bottom-[7px] left-1/2 z-40 -translate-x-1/2 rounded-full bg-[var(--foreground-strong)]",
                ios
                  ? "h-[5px] w-[120px] opacity-80"
                  : "h-[4px] w-[90px] opacity-60",
              )}
            />

            {/* Glass reflection */}
            <div className="pointer-events-none absolute inset-0 z-50 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
