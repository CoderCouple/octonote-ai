"use client";

/**
 * Admin → Explore: pick a dataset and a measure, group it by a dimension,
 * split it by a second one and filter it (slice and dice). Click a bar or a
 * row to drill down (filter to it and group by the next dimension); the
 * breadcrumb and the day / week / month switch roll back up. The whole view
 * lives in the URL, so a view can be bookmarked or shared with the team.
 */
import {
  EXPLORE_DATASETS,
  EXPLORE_RANGES,
  type ExploreDataset,
  type ExploreFilter,
  type ExploreGranularity,
  type ExploreQuery,
  type ExploreResult,
} from "@octonote/shared";
import { ChevronRight, Download, Loader2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { exploreAdmin } from "@/features/admin/api";
import {
  errorText,
  fmtPercent,
  PageBody,
  PageHeader,
  Panel,
} from "@/features/admin/components/ui";
import { cn } from "@/lib/utils";

/** Drill trail: each step filtered to a value and remembers what was grouped before it. */
type Step = ExploreFilter & { from: string };

interface View {
  dataset: string;
  measure: string;
  groupBy: string;
  splitBy: string | null;
  granularity: ExploreGranularity;
  days: number;
  excludeStaff: boolean;
  trail: Step[];
}

const DEFAULT: View = {
  dataset: "traffic",
  measure: "visits",
  groupBy: "time",
  splitBy: null,
  granularity: "day",
  days: 30,
  excludeStaff: true,
  trail: [],
};

function readView(params: URLSearchParams): View {
  try {
    const v = JSON.parse(params.get("v") ?? "null") as Partial<View> | null;
    return v ? { ...DEFAULT, ...v } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <Explore />
    </Suspense>
  );
}

function Explore() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(
    () => readView(new URLSearchParams(params.toString())),
    [params],
  );
  const ds =
    EXPLORE_DATASETS.find((d) => d.key === view.dataset) ??
    EXPLORE_DATASETS[0]!;
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (patch: Partial<View>) => {
    const next = { ...view, ...patch };
    router.replace(
      `${pathname}?v=${encodeURIComponent(JSON.stringify(next))}`,
      { scroll: false },
    );
  };

  const query: ExploreQuery = {
    dataset: view.dataset,
    measure: view.measure,
    groupBy: view.groupBy,
    splitBy: view.splitBy,
    granularity: view.granularity,
    days: view.days,
    excludeStaff: view.excludeStaff,
    filters: view.trail.map(({ dim, op, value }) => ({ dim, op, value })),
  };
  const key = JSON.stringify(query);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    exploreAdmin(JSON.parse(key) as ExploreQuery)
      .then((r) => live && setResult(r))
      .catch((err) => live && setError(errorText(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key]);

  const dimLabel = (k: string) =>
    ds.dimensions.find((d) => d.key === k)?.label ?? k;
  const measureLabel =
    ds.measures.find((m) => m.key === view.measure)?.label ?? view.measure;
  const filtered = new Set(
    view.trail.filter((s) => s.op === "eq").map((s) => s.dim),
  );

  /** The dimension to group by after drilling into `dim`. */
  const nextDim = (dim: string) => {
    const hinted = ds.dimensions.find((d) => d.key === dim)?.drill;
    if (hinted && !filtered.has(hinted) && hinted !== dim) return hinted;
    return (
      ds.dimensions.find(
        (d) => d.key !== "time" && d.key !== dim && !filtered.has(d.key),
      )?.key ?? "time"
    );
  };

  const drill = (value: string) => {
    if (view.groupBy === "time") {
      // Time can't be filtered; zoom in instead (month → week → day).
      if (view.granularity !== "day")
        set({ granularity: view.granularity === "month" ? "week" : "day" });
      return;
    }
    const to = nextDim(view.groupBy);
    set({
      trail: [
        ...view.trail,
        { dim: view.groupBy, op: "eq", value, from: view.groupBy },
      ],
      groupBy: to,
      splitBy: view.splitBy === to ? null : view.splitBy,
    });
  };
  const slice = (value: string, op: "eq" | "neq") =>
    set({
      trail: [
        ...view.trail,
        { dim: view.groupBy, op, value, from: view.groupBy },
      ],
    });
  const rollUpTo = (i: number) => {
    const step = view.trail[i];
    set({
      trail: view.trail.slice(0, i),
      groupBy: step ? step.from : view.groupBy,
    });
  };
  const removeStep = (i: number) =>
    set({ trail: view.trail.filter((_, j) => j !== i) });

  const switchDataset = (key: string) => {
    const next = EXPLORE_DATASETS.find((d) => d.key === key)!;
    set({
      dataset: key,
      measure: next.measures[0]!.key,
      groupBy: "time",
      splitBy: null,
      trail: [],
    });
  };

  return (
    <PageBody>
      <PageHeader title="Explore" description={ds.description}>
        {ds.staffAware ? (
          <label className="text-muted-foreground mr-3 inline-flex items-center gap-2 text-sm">
            <Switch
              checked={view.excludeStaff}
              onCheckedChange={(on) => set({ excludeStaff: on })}
              aria-label="Exclude staff"
            />
            Exclude staff
          </label>
        ) : null}
        <Segmented
          label="Period"
          value={String(view.days)}
          options={EXPLORE_RANGES.map((d) => ({
            value: String(d),
            label: `${d}d`,
          }))}
          onChange={(d) => set({ days: Number(d) })}
        />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Pick
          label="Dataset"
          value={view.dataset}
          onChange={switchDataset}
          options={EXPLORE_DATASETS.map((d) => ({
            value: d.key,
            label: d.label,
          }))}
        />
        <Pick
          label="Measure"
          value={view.measure}
          onChange={(m) => set({ measure: m })}
          options={ds.measures.map((m) => ({ value: m.key, label: m.label }))}
        />
        <Pick
          label="Group by"
          value={view.groupBy}
          onChange={(g) =>
            set({
              groupBy: g,
              splitBy: view.splitBy === g ? null : view.splitBy,
            })
          }
          options={ds.dimensions.map((d) => ({ value: d.key, label: d.label }))}
        />
        <Pick
          label="Split by"
          value={view.splitBy ?? ""}
          onChange={(s) => set({ splitBy: s || null })}
          options={[
            { value: "", label: "Nothing" },
            ...ds.dimensions
              .filter((d) => d.key !== "time" && d.key !== view.groupBy)
              .map((d) => ({ value: d.key, label: d.label })),
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <nav
          aria-label="Drill path"
          className="flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            onClick={() => rollUpTo(0)}
            className={cn(
              "rounded px-1.5 py-0.5",
              view.trail.length
                ? "text-muted-foreground hover:bg-muted"
                : "text-foreground-strong font-medium",
            )}
          >
            All {ds.label.toLowerCase()}
          </button>
          {view.trail.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <ChevronRight className="text-muted-foreground size-3.5" />
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
                  i === view.trail.length - 1
                    ? "text-foreground-strong"
                    : "text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => rollUpTo(i + 1)}
                  title="Roll up to here"
                  className="hover:underline"
                >
                  {dimLabel(s.dim)} {s.op === "eq" ? "is" : "is not"}{" "}
                  <b className="font-medium">{s.value}</b>
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  aria-label={`Remove ${dimLabel(s.dim)} filter`}
                  className="hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            </span>
          ))}
        </nav>
        {view.groupBy === "time" ? (
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="text-muted-foreground">Roll up</span>
            <Segmented
              label="Granularity"
              value={view.granularity}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
              onChange={(g) => set({ granularity: g as ExploreGranularity })}
            />
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !result ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-3 transition-opacity",
            loading && "opacity-60",
          )}
        >
          {result.error ? (
            <p className="text-muted-foreground text-sm">{result.error}</p>
          ) : null}
          <Insights r={result} measure={measureLabel} dimLabel={dimLabel} />
          <Panel
            title={`${measureLabel} by ${dimLabel(view.groupBy).toLowerCase()}${view.splitBy ? `, split by ${dimLabel(view.splitBy).toLowerCase()}` : ""}`}
          >
            <Chart r={result} onPick={drill} time={view.groupBy === "time"} />
          </Panel>
          <Panel>
            <ResultTable
              r={result}
              ds={ds}
              groupLabel={dimLabel(view.groupBy)}
              measure={measureLabel}
              canDrill={view.groupBy !== "time" || view.granularity !== "day"}
              time={view.groupBy === "time"}
              onDrill={drill}
              onSlice={slice}
            />
          </Panel>
        </div>
      )}
    </PageBody>
  );
}

function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background focus-visible:ring-ring h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="bg-muted inline-flex rounded-md p-0.5"
      role="tablist"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1 text-sm tabular-nums transition-colors",
            value === o.value
              ? "bg-background text-foreground-strong font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Split series share one hue in steps (the design is monochrome); the legend and table carry the names. */
const SPLIT_SHADES = [
  "bg-foreground-strong",
  "bg-foreground-strong/75",
  "bg-foreground-strong/55",
  "bg-foreground-strong/40",
  "bg-foreground-strong/28",
  "bg-foreground-strong/18",
  "bg-foreground-strong/10",
];

function cellsOf(r: ExploreResult) {
  const m = new Map<string, number>();
  for (const c of r.cells)
    m.set(
      `${c.group}\u0000${c.split ?? ""}`,
      (m.get(`${c.group}\u0000${c.split ?? ""}`) ?? 0) + c.value,
    );
  const get = (g: string, s: string | null) =>
    m.get(`${g}\u0000${s ?? ""}`) ?? 0;
  const groupTotal = (g: string) =>
    r.splits.length
      ? r.splits.reduce((sum, s) => sum + get(g, s), 0)
      : get(g, null);
  return { get, groupTotal };
}

const fmtGroup = (g: string, time: boolean) =>
  time
    ? new Date(`${g}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : g;

/** Columns over time, or horizontal bars for categories; stacked when split. Click to drill. */
function Chart({
  r,
  onPick,
  time,
}: {
  r: ExploreResult;
  onPick: (g: string) => void;
  time: boolean;
}) {
  const { get, groupTotal } = cellsOf(r);
  const max = Math.max(1, ...r.groups.map(groupTotal));
  const series = r.splits.length ? r.splits : [null];
  if (!r.groups.length)
    return (
      <p className="text-muted-foreground text-sm">Nothing in this period.</p>
    );
  const legend = r.splits.length ? (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {r.splits.map((s, i) => (
        <span
          key={s}
          className="text-muted-foreground inline-flex items-center gap-1.5"
        >
          <span
            className={cn(
              "size-2.5 rounded-sm",
              SPLIT_SHADES[i] ?? SPLIT_SHADES.at(-1),
            )}
          />
          {s}
        </span>
      ))}
    </div>
  ) : null;
  if (time) {
    return (
      <div>
        {legend}
        <div
          className="flex h-56 items-end gap-[2px]"
          role="img"
          aria-label="Values over time"
        >
          {r.groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onPick(g)}
              title={`${fmtGroup(g, true)}: ${groupTotal(g).toLocaleString()}`}
              className="group flex h-full min-w-0 flex-1 flex-col-reverse justify-start"
            >
              {series.map((s, i) => {
                const v = get(g, s);
                return v ? (
                  <span
                    key={s ?? "all"}
                    className={cn(
                      "w-full first:rounded-b-[2px] last:rounded-t-[3px] group-hover:opacity-80",
                      SPLIT_SHADES[i] ?? SPLIT_SHADES.at(-1),
                    )}
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                ) : null;
              })}
            </button>
          ))}
        </div>
        <div className="text-muted-foreground mt-1.5 flex justify-between text-xs tabular-nums">
          <span>{fmtGroup(r.groups[0]!, true)}</span>
          <span>{fmtGroup(r.groups.at(-1)!, true)}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      {legend}
      <ul className="grid gap-1.5">
        {r.groups.slice(0, 20).map((g) => (
          <li key={g}>
            <button
              type="button"
              onClick={() => onPick(g)}
              className="group grid w-full grid-cols-[minmax(0,14rem)_1fr_4rem] items-center gap-3 text-left text-sm"
              title="Drill in"
            >
              <span className="truncate group-hover:underline">{g}</span>
              <span className="bg-muted flex h-5 overflow-hidden rounded">
                {series.map((s, i) => {
                  const v = get(g, s);
                  return v ? (
                    <span
                      key={s ?? "all"}
                      className={cn(
                        "h-full",
                        SPLIT_SHADES[i] ?? SPLIT_SHADES.at(-1),
                      )}
                      style={{ width: `${(v / max) * 100}%` }}
                    />
                  ) : null;
                })}
              </span>
              <span className="text-foreground-strong text-right font-medium tabular-nums">
                {groupTotal(g).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {r.groups.length > 20 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Top 20 shown; the table has all {r.groups.length}.
        </p>
      ) : null}
    </div>
  );
}

/** A few plain-language takeaways: the biggest group and its share, and the trend over time. */
function Insights({
  r,
  measure,
  dimLabel,
}: {
  r: ExploreResult;
  measure: string;
  dimLabel: (k: string) => string;
}) {
  const { groupTotal } = cellsOf(r);
  const lines: string[] = [];
  const m = measure.toLowerCase();
  if (r.total && r.groups.length) {
    if (r.query.groupBy === "time") {
      const vals = r.groups.map(groupTotal);
      const half = Math.floor(vals.length / 2);
      const a = vals.slice(0, half).reduce((s, v) => s + v, 0);
      const b = vals.slice(vals.length - half).reduce((s, v) => s + v, 0);
      const best = r.groups[vals.indexOf(Math.max(...vals))]!;
      if (half && a)
        lines.push(
          `${measure} ${b >= a ? "up" : "down"} ${Math.round((Math.abs(b - a) / a) * 100)}% in the second half of the period (${b.toLocaleString()} vs ${a.toLocaleString()}).`,
        );
      lines.push(
        `Busiest ${r.query.granularity}: ${fmtGroup(best, true)} with ${groupTotal(best).toLocaleString()} ${m}.`,
      );
    } else {
      const top = r.groups[0]!;
      lines.push(
        `${top} leads with ${groupTotal(top).toLocaleString()} ${m} (${fmtPercent(groupTotal(top), r.total)} of all).`,
      );
      if (r.groups.length > 1) {
        const top3 = r.groups
          .slice(0, 3)
          .reduce((s, g) => s + groupTotal(g), 0);
        lines.push(
          `The top ${Math.min(3, r.groups.length)} of ${r.groups.length} ${dimLabel(r.query.groupBy).toLowerCase()} values make up ${fmtPercent(top3, r.total)}.`,
        );
      }
    }
  }
  return (
    <div className="bg-muted/50 grid gap-1 rounded-lg border px-4 py-3 text-sm">
      <p className="text-foreground-strong font-medium">
        {r.total.toLocaleString()} {m} in the last {r.query.days} days
        {r.query.excludeStaff ? ", staff excluded" : ""}
      </p>
      {lines.map((l) => (
        <p key={l} className="text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  );
}

function ResultTable({
  r,
  groupLabel,
  measure,
  canDrill,
  time,
  onDrill,
  onSlice,
}: {
  r: ExploreResult;
  ds: ExploreDataset;
  groupLabel: string;
  measure: string;
  canDrill: boolean;
  time: boolean;
  onDrill: (g: string) => void;
  onSlice: (g: string, op: "eq" | "neq") => void;
}) {
  const { get, groupTotal } = cellsOf(r);
  const rows = time ? [...r.groups].reverse() : r.groups;
  const csv = () => {
    const head = [groupLabel, ...r.splits, measure];
    const body = r.groups.map((g) => [
      g,
      ...r.splits.map((s) => get(g, s)),
      groupTotal(g),
    ]);
    const text = [head, ...body]
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `octonote-${r.query.dataset}-${r.query.groupBy}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-foreground-strong text-sm font-medium">
          {r.groups.length} {r.groups.length === 1 ? "row" : "rows"}
          {r.truncated ? " (top 50)" : ""}
        </p>
        <button
          type="button"
          onClick={csv}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <Download className="size-3.5" /> CSV
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="py-2 pr-3 font-medium">{groupLabel}</th>
            {r.splits.map((s) => (
              <th key={s} className="px-2 py-2 text-right font-medium">
                {s}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">{measure}</th>
            <th className="px-2 py-2 text-right font-medium">Share</th>
            <th className="py-2 pl-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g} className="hover:bg-muted/40 border-b last:border-0">
              <td className="max-w-[22rem] truncate py-1.5 pr-3">
                {fmtGroup(g, time)}
              </td>
              {r.splits.map((s) => (
                <td key={s} className="px-2 py-1.5 text-right tabular-nums">
                  {get(g, s).toLocaleString()}
                </td>
              ))}
              <td className="text-foreground-strong px-2 py-1.5 text-right font-medium tabular-nums">
                {groupTotal(g).toLocaleString()}
              </td>
              <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
                {fmtPercent(groupTotal(g), r.total)}
              </td>
              <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                {canDrill ? (
                  <button
                    type="button"
                    onClick={() => onDrill(g)}
                    className="text-muted-foreground hover:text-foreground mr-2 text-xs underline-offset-2 hover:underline"
                  >
                    {time ? "Zoom in" : "Drill in"}
                  </button>
                ) : null}
                {!time ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSlice(g, "eq")}
                      className="text-muted-foreground hover:text-foreground mr-2 text-xs underline-offset-2 hover:underline"
                    >
                      Only this
                    </button>
                    <button
                      type="button"
                      onClick={() => onSlice(g, "neq")}
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                    >
                      Exclude
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
