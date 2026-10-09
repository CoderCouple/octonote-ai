"use client";

/**
 * Monochrome area chart of a count per bucket (views or visitors), drawn as plain SVG (no chart
 * library). Hover or focus shows the bucket's date and count.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { BucketUnit } from "../api";

const W = 560;
const H = 180;
const PAD_TOP = 12;

export function formatBucket(iso: string, unit: BucketUnit, long = false) {
  const d = new Date(iso);
  if (unit === "hour")
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  if (unit === "month")
    return d.toLocaleDateString(undefined, {
      month: long ? "long" : "short",
      year: long ? "numeric" : undefined,
    });
  const day = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return unit === "week" && long ? `Week of ${day}` : day;
}

export function ViewsChart({
  buckets,
  noun,
  unit,
}: {
  buckets: { start: string; value: number }[];
  /** Singular and plural noun for the tooltip, e.g. ["view", "views"]. */
  noun: [string, string];
  unit: BucketUnit;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const n = buckets.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / max);
  const line = buckets
    .map(
      (b, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(n - 1)},${H} L${x(0)},${H} Z`;
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];
  const active = hover !== null ? buckets[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-44 w-full overflow-visible"
        role="img"
        aria-label={`${noun[1]} chart, ${buckets.reduce((a, b) => a + b.value, 0)} ${noun[1]}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                n - 1,
                Math.round(((e.clientX - r.left) / r.width) * (n - 1)),
              ),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--foreground-strong)"
              stopOpacity="0.16"
            />
            <stop
              offset="100%"
              stopColor="var(--foreground-strong)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={PAD_TOP + (H - PAD_TOP) * f}
            y2={PAD_TOP + (H - PAD_TOP) * f}
            stroke="var(--border)"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={0}
          x2={W}
          y1={H}
          y2={H}
          stroke="var(--border)"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--foreground-strong)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={0}
            y2={H}
            stroke="var(--foreground-subtle)"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {active && hover !== null ? (
        <div
          className={cn(
            "bg-popover pointer-events-none absolute top-0 z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
            hover > n / 2 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
          )}
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="text-muted-foreground">
            {formatBucket(active.start, unit, true)}
          </p>
          <p className="text-foreground-strong font-semibold tabular-nums">
            {active.value.toLocaleString()}{" "}
            {active.value === 1 ? noun[0] : noun[1]}
          </p>
        </div>
      ) : null}
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        {ticks.map((t) => (
          <span key={t}>
            {buckets[t] ? formatBucket(buckets[t].start, unit) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
