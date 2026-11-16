"use client";

import { STUDIO_KIND_HINT, STUDIO_KIND_LABEL, STUDIO_KINDS, STUDIO_SOURCE_LABEL, type StudioItemSummary, type StudioKind, type StudioStats } from "@octonote/shared";
import { ArrowUpRight, Globe, LayoutGrid, Loader2, Plus, Rows3, Search, Trash2, TrendingDown, TrendingUp, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { studioApi, type StudioList } from "./api";
import { KIND_ICON, KindBadge, SOURCE_ICON, StatusBadge, since } from "./kinds";
import { NewItemDialog } from "./new-item-dialog";

const VIEW_KEY = "octonote-studio-view";

/** Studio's home: what's been made, how it went, and a way to make more. */
export function StudioHome({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<StudioList | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"table" | "grid">("table");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<StudioKind | "all">("all");
  const [creating, setCreating] = useState<{ kind?: StudioKind } | null>(null);
  const [deleting, setDeleting] = useState<StudioItemSummary | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "table") setView(saved);
    } catch {
      // Storage blocked: the table view.
    }
  }, []);
  const pickView = (v: "table" | "grid") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not kept.
    }
  };

  const load = useCallback(async () => {
    try {
      setData(await studioApi.list(workspaceId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // While something is being made, keep the list fresh.
  const running = data?.stats.running ?? 0;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [running, load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (it) => (kind === "all" || it.kind === kind) && (!needle || it.title.toLowerCase().includes(needle) || it.sourceLabel.toLowerCase().includes(needle)),
    );
  }, [data, q, kind]);

  const remove = async (item: StudioItemSummary) => {
    await studioApi.remove(item.id);
    setData((d) => d && { items: d.items.filter((x) => x.id !== item.id), stats: recount(d.items.filter((x) => x.id !== item.id), d.stats) });
    toast.success("Deleted");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-foreground-strong flex items-center gap-2.5 text-2xl font-bold tracking-tight md:text-3xl">
            <WandSparkles className="size-6" />
            Studio
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl">Turn text, a web page, a note or a PDF into an infographic, mind map, flashcards, a quiz and more.</p>
        </div>
        <Button onClick={() => setCreating({})} className="gap-2">
          <Plus className="size-4" />
          New
        </Button>
      </header>

      {data ? <StatCards stats={data.stats} /> : <StatSkeleton />}

      {data && data.items.length === 0 ? (
        <EmptyStudio onPick={(k) => setCreating({ kind: k })} />
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground mr-auto text-sm tabular-nums">
              {data ? `${shown.length} ${shown.length === 1 ? "item" : "items"}${shown.length !== data.items.length ? ` of ${data.items.length}` : ""}` : " "}
            </p>
            <div className="bg-card flex h-9 items-center gap-2 rounded-md border px-2.5">
              <Search className="text-muted-foreground size-4" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search Studio" className="w-36 bg-transparent text-sm outline-none md:w-48" />
            </div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as StudioKind | "all")}
              aria-label="Format"
              className="bg-card h-9 rounded-md border px-2.5 text-sm"
            >
              <option value="all">All formats</option>
              {STUDIO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STUDIO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <div role="group" aria-label="View" className="bg-muted inline-flex gap-0.5 rounded-md border p-0.5">
              {(
                [
                  ["table", Rows3, "Table"],
                  ["grid", LayoutGrid, "Grid"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  aria-label={label}
                  onClick={() => pickView(v)}
                  className={cn("grid size-7 place-items-center rounded", view === v ? "bg-card text-foreground-strong shadow-xs" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>

          {failed && !data ? (
            <div className="text-muted-foreground mt-4 rounded-xl border border-dashed p-8 text-center text-sm">
              Studio couldn&apos;t be loaded.{" "}
              <button type="button" className="text-foreground underline" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : !data ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground mt-4 rounded-xl border border-dashed p-8 text-center text-sm">Nothing matches.</p>
          ) : view === "table" ? (
            <ItemsTable items={shown} onDelete={setDeleting} />
          ) : (
            <ItemsGrid items={shown} onDelete={setDeleting} />
          )}
        </section>
      )}

      <NewItemDialog workspaceId={workspaceId} open={!!creating} onOpenChange={(o) => !o && setCreating(null)} initialKind={creating?.kind} />
      <ConfirmActionDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this item?"
        description={`“${deleting?.title ?? ""}” will be deleted. Notes you've already added it to keep their copy.`}
        onConfirm={async () => {
          if (deleting) await remove(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function recount(items: StudioItemSummary[], prev: StudioStats): StudioStats {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    total: items.length,
    succeeded: items.filter((i) => i.status === "succeeded").length,
    running: items.filter((i) => i.status === "running").length,
    failed: items.filter((i) => i.status === "failed").length,
    thisWeek: Math.min(prev.thisWeek, items.filter((i) => new Date(i.createdAt).getTime() >= weekAgo).length),
  };
}

/* ───────────── Stat cards ───────────── */

function StatCards({ stats }: { stats: StudioStats }) {
  const pct = (n: number) => (stats.total ? `${Math.round((n / stats.total) * 100)}%` : "0%");
  const tiles = [
    {
      label: "Items",
      value: stats.total,
      badge: `+${stats.thisWeek}`,
      up: stats.thisWeek > 0,
      bold: stats.thisWeek ? `${stats.thisWeek} new this week` : "No new items this week",
      hint: "All time in this workspace",
    },
    { label: "Ready", value: stats.succeeded, badge: pct(stats.succeeded), up: true, bold: stats.succeeded ? "Ready to use and share" : "Nothing ready yet", hint: "Made without errors" },
    { label: "Making", value: stats.running, badge: String(stats.running), up: stats.running > 0, bold: stats.running ? "The AI is working" : "All idle", hint: "Being made right now" },
    { label: "Failed", value: stats.failed, badge: pct(stats.failed), up: false, bold: stats.failed ? "Open one to try again" : "No failures", hint: "Couldn't be made" },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => {
        const Trend = t.up ? TrendingUp : TrendingDown;
        return (
          <div key={t.label} className="bg-card rounded-xl border p-5 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-sm">{t.label}</p>
              <span className="text-foreground flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums">
                {t.label === "Making" && stats.running ? <Loader2 className="size-3 animate-spin" /> : <Trend className="size-3" />}
                {t.badge}
              </span>
            </div>
            <p className="text-foreground-strong mt-1 text-3xl font-semibold tabular-nums">{t.value.toLocaleString()}</p>
            <p className="text-foreground-strong mt-5 text-sm font-medium">{t.bold}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-muted h-[150px] animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

/* ───────────── Table and grid ───────────── */

function ItemsTable({ items, onDelete }: { items: StudioItemSummary[]; onDelete: (item: StudioItemSummary) => void }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[860px] table-fixed text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left text-xs font-medium">
          <tr className="border-b">
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="w-[150px] px-3 py-3 font-medium">Format</th>
            <th className="w-[26%] px-3 py-3 font-medium">Source</th>
            <th className="w-[110px] px-3 py-3 font-medium">Status</th>
            <th className="w-[110px] px-3 py-3 font-medium">Updated</th>
            <th className="w-[96px] px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const SourceIcon = SOURCE_ICON[it.sourceType];
            return (
              <tr key={it.id} className="hover:bg-muted/30 group border-b last:border-b-0">
                <td className="px-4 py-3">
                  <Link href={`/workspace/studio/${it.id}`} className="text-foreground-strong flex items-center gap-1.5 font-semibold hover:underline">
                    <span className="truncate">{it.title}</span>
                    {it.published ? <Globe className="text-muted-foreground size-3.5 shrink-0" aria-label="Shared by link" /> : null}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <KindBadge kind={it.kind} label={STUDIO_KIND_LABEL[it.kind]} />
                </td>
                <td className="text-muted-foreground px-3 py-3">
                  <span className="flex items-center gap-1.5">
                    <SourceIcon className="size-3.5 shrink-0" />
                    <span className="truncate" title={it.sourceLabel}>
                      {it.sourceLabel || STUDIO_SOURCE_LABEL[it.sourceType]}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={it.status} />
                </td>
                <td className="text-muted-foreground px-3 py-3 whitespace-nowrap tabular-nums">{since(it.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <RowAction label="Open" href={`/workspace/studio/${it.id}`} icon={ArrowUpRight} />
                    <RowAction label="Delete" onClick={() => onDelete(it)} icon={Trash2} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowAction({ label, icon: Icon, href, onClick }: { label: string; icon: typeof Trash2; href?: string; onClick?: () => void }) {
  const cls = "text-muted-foreground hover:text-foreground hover:bg-muted grid size-8 place-items-center rounded-md transition-colors";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} aria-label={label} className={cls}>
            <Icon className="size-4" />
          </Link>
        ) : (
          <button type="button" aria-label={label} onClick={onClick} className={cls}>
            <Icon className="size-4" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ItemsGrid({ items, onDelete }: { items: StudioItemSummary[]; onDelete: (item: StudioItemSummary) => void }) {
  return (
    <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind];
        return (
          <li key={it.id} className="bg-card group relative flex flex-col rounded-xl border shadow-xs transition-shadow hover:shadow-md">
            <Link href={`/workspace/studio/${it.id}`} className="flex flex-1 flex-col p-4">
              <div className="bg-muted/60 mb-4 grid h-28 place-items-center rounded-lg border">
                <Icon className="text-muted-foreground size-9" strokeWidth={1.5} />
              </div>
              <div className="flex items-center gap-2">
                <KindBadge kind={it.kind} label={STUDIO_KIND_LABEL[it.kind]} />
                <StatusBadge status={it.status} />
              </div>
              <p className="text-foreground-strong mt-3 line-clamp-2 font-semibold">{it.title}</p>
              <p className="text-muted-foreground mt-auto flex items-center gap-1.5 pt-3 text-xs">
                {it.published ? <Globe className="size-3" /> : null}
                <span className="truncate">{it.sourceLabel}</span>
                <span>·</span>
                <span className="shrink-0 tabular-nums">{since(it.updatedAt)}</span>
              </p>
            </Link>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => onDelete(it)}
              className="bg-card text-muted-foreground hover:text-foreground absolute top-6 right-6 grid size-8 place-items-center rounded-md border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────── Empty state ───────────── */

function EmptyStudio({ onPick }: { onPick: (kind: StudioKind) => void }) {
  return (
    <section className="mt-8 rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="bg-muted mx-auto grid size-12 place-items-center rounded-xl border">
        <WandSparkles className="size-5" />
      </div>
      <h2 className="text-foreground-strong mt-4 text-lg font-semibold">Make your first item</h2>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">Pick a format, give it something to read, and the AI builds it. Everything you make can be shared or added to a note.</p>
      <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-2 text-left sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button key={k} type="button" onClick={() => onPick(k)} className="bg-card hover:bg-muted/40 flex items-start gap-3 rounded-xl border p-3 transition-colors">
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg border">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground-strong block text-sm font-semibold">{STUDIO_KIND_LABEL[k]}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{STUDIO_KIND_HINT[k]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
