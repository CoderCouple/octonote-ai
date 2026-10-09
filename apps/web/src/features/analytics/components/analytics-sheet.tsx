"use client";

/**
 * Side panel with real view analytics for one note / canvas / project /
 * notebook: views over a chosen range, change vs the previous period, and
 * the item's publish details. Counts come from anonymous hourly counters on
 * published pages (see services/api AnalyticsService).
 */
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Globe,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, shareKeys, type ResourceKind } from "@/features/sharing";
import { getPublishStateApi } from "@/features/sharing/api/sharing-api";
import { cn } from "@/lib/utils";
import { analyticsKeys, getAnalyticsApi, type AnalyticsRange } from "../api";
import { ViewsChart } from "./views-chart";

const RANGES: { value: AnalyticsRange; label: string; long: string }[] = [
  { value: "24h", label: "24h", long: "last 24 hours" },
  { value: "7d", label: "7d", long: "last 7 days" },
  { value: "30d", label: "30d", long: "last 30 days" },
  { value: "6mo", label: "6mo", long: "last 6 months" },
  { value: "1y", label: "1y", long: "last year" },
];

type Metric = "visitors" | "views";

const METRICS: { key: Metric; label: string }[] = [
  { key: "visitors", label: "Unique visitors" },
  { key: "views", label: "Views" },
];

export interface AnalyticsTarget {
  kind: ResourceKind;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  accessLabel: string;
}

export function AnalyticsSheet({
  target,
  onOpenChange,
}: {
  target: AnalyticsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-xl"
      >
        {target ? <Body target={target} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ target }: { target: AnalyticsTarget }) {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const analytics = useQuery({
    queryKey: analyticsKeys.one(target.kind, target.id, range),
    queryFn: () => getAnalyticsApi(target.kind, target.id, range),
  });
  const publish = useQuery({
    queryKey: shareKeys.publish(target.kind, target.id),
    queryFn: () => getPublishStateApi(target.kind, target.id),
  });
  const [metric, setMetric] = useState<Metric>("visitors");
  const a = analytics.data;
  const rangeLong = RANGES.find((r) => r.value === range)!.long;
  const totals = a
    ? {
        visitors: { now: a.visitors, before: a.previousVisitors },
        views: { now: a.total, before: a.previousTotal },
      }
    : null;
  const publicUrl = publish.data?.publicUrl
    ? publish.data.publicUrl.startsWith("/")
      ? `${typeof window === "undefined" ? "" : window.location.origin}${publish.data.publicUrl}`
      : publish.data.publicUrl
    : null;

  return (
    <>
      <SheetHeader className="border-b px-6 py-5">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {KIND_LABEL[target.kind]} analytics
        </p>
        <SheetTitle className="text-foreground-strong truncate text-xl font-semibold tracking-tight">
          {target.title || "Untitled"}
        </SheetTitle>
        <SheetDescription>
          Readers of the published page. Anonymous — no cookies; bots and your
          own visits excluded.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Last {rangeLong.replace("last ", "")}
          </p>
          <div
            role="tablist"
            aria-label="Time range"
            className="bg-muted flex rounded-lg p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r.value}
                role="tab"
                aria-selected={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                  range === r.value
                    ? "bg-background text-foreground-strong shadow-xs"
                    : "text-muted-foreground hover:text-foreground-strong",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border">
          <div
            role="tablist"
            aria-label="Metric"
            className="grid grid-cols-2 border-b"
          >
            {METRICS.map((m) => {
              const t = totals?.[m.key];
              return (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={metric === m.key}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "relative px-5 py-4 text-left transition-colors first:border-r",
                    metric === m.key ? "" : "hover:bg-accent/40",
                  )}
                >
                  <p
                    className={cn(
                      "text-sm",
                      metric === m.key
                        ? "text-foreground-strong"
                        : "text-muted-foreground",
                    )}
                  >
                    {m.label}
                  </p>
                  <div className="mt-1 flex items-center gap-2.5">
                    {t ? (
                      <span className="text-foreground-strong text-3xl font-semibold tabular-nums">
                        {t.now.toLocaleString()}
                      </span>
                    ) : (
                      <Skeleton className="h-9 w-16" />
                    )}
                    {t ? <ChangeBadge now={t.now} before={t.before} /> : null}
                  </div>
                  {metric === m.key ? (
                    <span className="bg-foreground-strong absolute inset-x-0 bottom-0 h-0.5" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            {a ? (
              a.allTime === 0 ? (
                <EmptyChart published={publish.data?.published ?? false} />
              ) : (
                <ViewsChart
                  buckets={a.buckets.map((b) => ({
                    start: b.start,
                    value: b[metric],
                  }))}
                  noun={
                    metric === "views"
                      ? ["view", "views"]
                      : ["visitor", "visitors"]
                  }
                  unit={a.unit}
                />
              )
            ) : analytics.isError ? (
              <p className="text-muted-foreground grid h-52 place-items-center text-sm">
                Couldn&apos;t load analytics.
              </p>
            ) : (
              <Skeleton className="h-52 w-full" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="All-time visitors"
            value={a ? a.allTimeVisitors.toLocaleString() : null}
          />
          <Tile
            label="All-time views"
            value={a ? a.allTime.toLocaleString() : null}
          />
          <Tile
            label="Views per visitor"
            value={
              a
                ? a.visitors > 0
                  ? (a.total / a.visitors).toFixed(1)
                  : "—"
                : null
            }
            hint={rangeLong.charAt(0).toUpperCase() + rangeLong.slice(1)}
          />
          <Tile
            label="Last viewed"
            value={
              a ? (a.lastViewedAt ? relative(a.lastViewedAt) : "Never") : null
            }
          />
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          A visitor is counted once per day per page. Signed-in readers are
          counted by account; others by an anonymous hash that resets every day,
          so the same person on different days counts again.
        </p>

        <dl className="divide-y rounded-xl border">
          <Field label="Status">
            {publish.data ? (
              <span className="flex items-center gap-1.5">
                {publish.data.published ? (
                  <Globe className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {publish.data.published
                  ? publish.data.publishedVia
                    ? `Published via ${publish.data.publishedVia.name}`
                    : "Published"
                  : "Not published"}
              </span>
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
          </Field>
          {publicUrl ? (
            <Field label="Public link">
              <CopyLink url={publicUrl} />
            </Field>
          ) : null}
          <Field label="Access">{target.accessLabel}</Field>
          <Field label="Created">{fullDate(target.createdAt)}</Field>
          <Field label="Updated">{fullDate(target.updatedAt)}</Field>
        </dl>
      </div>
    </>
  );
}

function ChangeBadge({ now, before }: { now: number; before: number }) {
  if (before === 0) {
    return now > 0 ? (
      <span className="rounded-md border px-1.5 py-0.5 text-xs font-medium">
        New
      </span>
    ) : null;
  }
  const change = Math.round(((now - before) / before) * 100);
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums">
      <Icon className="size-3" />
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

function EmptyChart({ published }: { published: boolean }) {
  return (
    <div className="grid h-52 place-items-center text-center">
      <div>
        <p className="text-foreground-strong text-sm font-medium">
          No views yet
        </p>
        <p className="text-muted-foreground mt-1 max-w-xs text-sm">
          {published
            ? "Views appear here when people open the published page."
            : "Views are counted only while it's published. Publish it from the Share menu."}
        </p>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1.5 h-6 w-16" />
      ) : (
        <p className="text-foreground-strong mt-1 text-lg font-semibold tabular-nums">
          {value}
        </p>
      )}
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground-strong min-w-0 text-right">{children}</dd>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="hover:text-foreground-strong text-muted-foreground flex max-w-64 items-center gap-1.5 truncate font-mono text-xs"
      title="Copy link"
    >
      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <Copy className="size-3.5 shrink-0" />
      )}
    </button>
  );
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Counters are hourly, so "last viewed" is accurate to the hour. */
function relative(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "This hour";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fullDate(iso);
}
