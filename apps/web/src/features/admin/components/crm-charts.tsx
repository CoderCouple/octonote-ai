"use client";

/**
 * Charts for Admin → Follow-ups, in the shadcn chart look (soft-filled areas,
 * light grid, a tooltip card, a legend) drawn as plain SVG like the app's
 * other charts, so no chart library is loaded. Monochrome from the design
 * tokens, so they follow light and dark mode: the second series is told apart
 * by a lighter tone and a dashed line, never by hue alone.
 */
import { CRM_STATUS_LABELS, type CrmOverview } from "@octonote/shared";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

const STRONG = "var(--foreground-strong)";
const SOFT = "var(--muted-foreground)";
const GRID = "var(--border)";

const weekLabel = (iso: string, long = false) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return long ? `Week of ${day}` : day;
};

/** Sent and replies per week as two smooth areas, with a hover tooltip. */
export function OutreachChart({ weekly }: { weekly: CrmOverview["weekly"] }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 180;
  const max = Math.max(4, ...weekly.map((w) => Math.max(w.sent, w.replies)));
  const top = Math.ceil(max / 4) * 4;
  const x = (i: number) => (W / weekly.length) * (i + 0.5);
  const y = (v: number) => H - (v / top) * (H - 6);

  // Catmull-Rom → Bézier: a smooth line through every point, like shadcn's "natural" curve.
  const line = (vals: number[]) => {
    const pts = vals.map((v, i) => [x(i), y(v)] as const);
    let d = `M${pts[0]![0]},${pts[0]![1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      // Clamp control points to the chart so the curve never dips below zero.
      const c1y = Math.min(H, p1[1] + (p2[1] - p0[1]) / 6);
      const c2y = Math.min(H, p2[1] - (p3[1] - p1[1]) / 6);
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${c1y} ${p2[0] - (p3[0] - p1[0]) / 6},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  };
  const area = (l: string) => `${l} L${x(weekly.length - 1)},${H} L${x(0)},${H} Z`;
  const sent = line(weekly.map((w) => w.sent));
  const replies = line(weekly.map((w) => w.replies));
  const h = hover === null ? null : weekly[hover];
  const left = hover === null ? 0 : ((hover + 0.5) / weekly.length) * 100;
  const total = weekly.reduce((n, w) => n + w.sent, 0);
  const totalReplies = weekly.reduce((n, w) => n + w.replies, 0);

  return (
    <div>
      <div className="relative h-[200px]" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 h-[180px] w-full overflow-visible"
          role="img"
          aria-label={`Messages sent and replies per week for the last ${weekly.length} weeks: ${total} sent, ${totalReplies} replies.`}
        >
          <defs>
            <linearGradient id={`sent-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={STRONG} stopOpacity={0.35} />
              <stop offset="95%" stopColor={STRONG} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id={`replies-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SOFT} stopOpacity={0.45} />
              <stop offset="95%" stopColor={SOFT} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke={GRID} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W} y1={H} y2={H} stroke={GRID} vectorEffect="non-scaling-stroke" />
          <path d={area(sent)} fill={`url(#sent-${id})`} />
          <path d={sent} fill="none" stroke={STRONG} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path d={area(replies)} fill={`url(#replies-${id})`} />
          <path d={replies} fill="none" stroke={SOFT} strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke={SOFT} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        <div className="absolute inset-x-0 top-0 flex h-[180px]">
          {weekly.map((w, i) => (
            <div
              key={w.week}
              className="flex-1"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${weekLabel(w.week, true)}: ${w.sent} sent, ${w.replies} replies`}
            />
          ))}
        </div>
        {h ? (
          <div
            className="bg-background pointer-events-none absolute top-2 min-w-40 rounded-lg border px-3 py-2.5 text-xs shadow-md"
            style={left > 60 ? { right: `${100 - left + 3}%` } : { left: `${left + 3}%` }}
          >
            <p className="text-foreground-strong mb-1.5 font-semibold">{weekLabel(h.week, true)}</p>
            <p className="text-muted-foreground flex items-center gap-2">
              <span className="size-2.5 rounded-[2px]" style={{ background: STRONG }} />
              Sent<span className="text-foreground-strong ml-auto font-semibold tabular-nums">{h.sent}</span>
            </p>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <span className="size-2.5 rounded-[2px]" style={{ background: SOFT }} />
              Replies<span className="text-foreground-strong ml-auto font-semibold tabular-nums">{h.replies}</span>
            </p>
            {h.sent ? <p className="text-muted-foreground mt-1.5">{Math.round((h.replies / h.sent) * 100)}% reply rate</p> : null}
          </div>
        ) : null}
        <div className="absolute inset-x-0 top-[186px] flex" aria-hidden>
          {weekly.map((w) => (
            <span key={w.week} className="text-muted-foreground flex-1 text-center text-[11px]">
              {weekLabel(w.week)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-muted-foreground mt-3 flex justify-center gap-5 text-xs" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: STRONG }} />
          Sent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: SOFT }} />
          Replies
        </span>
      </div>
    </div>
  );
}

/** People by status as horizontal bars, with the count beside each and a hover note. */
export function PipelineChart({ pipeline }: { pipeline: CrmOverview["pipeline"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = pipeline.reduce((n, p) => n + p.count, 0);
  const max = Math.max(1, ...pipeline.map((p) => p.count));
  const h = hover === null ? null : pipeline[hover];
  return (
    <div>
      <ul
        className="flex flex-col gap-1.5"
        aria-label={`Pipeline: ${pipeline.map((p) => `${CRM_STATUS_LABELS[p.status]} ${p.count}`).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        {pipeline.map((p, i) => (
          <li
            key={p.status}
            className="grid grid-cols-[104px_minmax(0,1fr)_32px] items-center gap-2.5"
            onMouseEnter={() => setHover(i)}
          >
            <span className="text-muted-foreground text-[13px]">{CRM_STATUS_LABELS[p.status]}</span>
            <span className="relative h-3.5">
              <span
                className={cn("absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity", hover !== null && hover !== i && "opacity-50")}
                style={{
                  width: `${p.count ? Math.max(2, (p.count / max) * 100) : 0}%`,
                  background: p.status === "not_interested" ? SOFT : STRONG,
                }}
              />
            </span>
            <span className="text-foreground-strong text-right text-[13px] font-semibold tabular-nums">{p.count}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-3 min-h-4 text-xs">
        {h
          ? `${CRM_STATUS_LABELS[h.status]}: ${h.count} ${h.count === 1 ? "person" : "people"} (${total ? Math.round((h.count / total) * 100) : 0}% of ${total})`
          : `${total} ${total === 1 ? "person" : "people"} in total. Hover a bar for details.`}
      </p>
    </div>
  );
}

const SOURCE_NAMES: Record<string, string> = { web: "web", mobile: "phone", cli: "CLI" };

/** The last 30 days as small columns: filled on days they used Octonote, with where in the hover note. */
export function ActivityStrip({ activity, className }: { activity: { day: string; sources: string[] }[]; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const active = activity.filter((a) => a.sources.length > 0).length;
  const h = hover === null ? null : activity[hover];
  const label = (a: { day: string; sources: string[] }) =>
    `${new Date(`${a.day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}: ${
      a.sources.length ? `used Octonote on ${a.sources.map((s) => SOURCE_NAMES[s] ?? s).join(" and ")}` : "not active"
    }`;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        role="img"
        aria-label={`Active on ${active} of the last 30 days`}
        className="flex h-5 items-end gap-[2px]"
        onMouseLeave={() => setHover(null)}
      >
        {activity.map((a, i) => (
          <span
            key={a.day}
            onMouseEnter={() => setHover(i)}
            className="flex h-full w-[4px] items-end"
            title={label(a)}
          >
            <span
              className="w-full rounded-t-[2px]"
              style={{
                height: a.sources.length ? `${40 + a.sources.length * 20}%` : "2px",
                background: a.sources.length ? (hover === i ? "var(--foreground)" : STRONG) : GRID,
              }}
            />
          </span>
        ))}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">{h ? label(h) : `${active} of 30 days`}</span>
    </span>
  );
}
