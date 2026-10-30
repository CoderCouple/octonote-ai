"use client";

/**
 * Admin → Overview: website traffic, growth, revenue, codes & offers and
 * product usage over the last 7, 30 or 90 days. Traffic comes from PostHog
 * (read by the API, GET /admin/traffic); everything else from Octonote's own
 * database (GET /admin/metrics). "Exclude staff" (on by default) leaves out
 * admins, @octonote.ai and the API's STAFF_EMAILS.
 */
import {
  ADMIN_METRIC_RANGES,
  type AdminMetricRange,
  type AdminMetrics,
  type AdminTraffic,
} from "@octonote/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { getAdminMetrics, getAdminTraffic } from "@/features/admin/api";
import {
  change,
  errorText,
  fmtDateTime,
  fmtMoney,
  fmtPercent,
  PageBody,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
} from "@/features/admin/components/ui";
import { ViewsChart } from "@/features/analytics/components/views-chart";
import { cn } from "@/lib/utils";

const RANGE_KEY = "octonote.admin.range";
const STAFF_KEY = "octonote.admin.excludeStaff";

export default function AdminOverviewPage() {
  const [days, setDays] = useState<AdminMetricRange>(30);
  const [excludeStaff, setExcludeStaff] = useState(true);
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [traffic, setTraffic] = useState<AdminTraffic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(RANGE_KEY));
      if ((ADMIN_METRIC_RANGES as readonly number[]).includes(saved))
        setDays(saved as AdminMetricRange);
      if (localStorage.getItem(STAFF_KEY) === "0") setExcludeStaff(false);
    } catch {
      // Storage unavailable: keep the defaults.
    }
  }, []);

  useEffect(() => {
    let live = true;
    setError(null);
    setTraffic(null);
    getAdminMetrics(days, excludeStaff)
      .then((m) => live && setData(m))
      .catch((err) => live && setError(errorText(err)));
    // Slower (PostHog), and never blocks the rest of the page.
    getAdminTraffic(days, excludeStaff)
      .then((t) => live && setTraffic(t))
      .catch(() => live && setTraffic(null));
    return () => {
      live = false;
    };
  }, [days, excludeStaff]);

  function toggleStaff(on: boolean) {
    setExcludeStaff(on);
    try {
      localStorage.setItem(STAFF_KEY, on ? "1" : "0");
    } catch {
      // Not remembered; fine.
    }
  }

  function pick(d: AdminMetricRange) {
    setDays(d);
    try {
      localStorage.setItem(RANGE_KEY, String(d));
    } catch {
      // Not remembered; fine.
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Overview"
        description={
          data
            ? `Last ${data.days} days · updated ${fmtDateTime(data.generatedAt)}`
            : "How Octonote is doing."
        }
      >
        <label className="text-muted-foreground mr-3 inline-flex items-center gap-2 text-sm">
          <Switch
            checked={excludeStaff}
            onCheckedChange={toggleStaff}
            aria-label="Exclude staff"
          />
          Exclude staff
        </label>
        <div
          className="bg-muted inline-flex rounded-md p-0.5"
          role="tablist"
          aria-label="Period"
        >
          {ADMIN_METRIC_RANGES.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={days === d}
              onClick={() => pick(d)}
              className={cn(
                "rounded px-3 py-1 text-sm tabular-nums transition-colors",
                days === d
                  ? "bg-background text-foreground-strong font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d} days
            </button>
          ))}
        </div>
      </PageHeader>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !data ||
        data.days !== days ||
        Boolean(data.excludeStaff) !== excludeStaff ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <>
          <TrafficSection t={traffic} days={days} />
          <Dashboard m={data} />
        </>
      )}
    </PageBody>
  );
}

/** Daily rows as chart points (noon, so the date doesn't shift in any time zone). */
const series = <T extends { day: string }>(rows: T[], pick: (r: T) => number) =>
  rows.map((r) => ({ start: `${r.day}T12:00:00`, value: pick(r) }));

/** "pub:my-page-x7q2" → "Published page: my-page-x7q2". */
function signupSourceLabel(ref: string): string {
  if (ref === "direct") return "Direct (no source)";
  if (ref === "pub-header") return "Published page header";
  const [kind, from] = ref.split(":");
  if (kind === "pub")
    return from ? `End of /pub/${from}` : "End of a published page";
  return from ? `${kind}: ${from}` : kind;
}

function Dashboard({ m }: { m: AdminMetrics }) {
  const { growth: g, revenue: r, codes: c, usage: u } = m;
  const sourcesTotal = g.bySource.web + g.bySource.mobile + g.bySource.cli;
  return (
    <>
      <Section
        title="Growth"
        description="People signing up and coming back. Active counts started on Oct 14, 2026."
      >
        <StatGrid>
          <Stat
            label="People"
            value={g.users.toLocaleString()}
            sub={`${g.workspaces.toLocaleString()} workspaces`}
          />
          <Stat
            label={`Sign-ups (${m.days} days)`}
            value={g.signups.toLocaleString()}
            sub={change(g.signups, g.signupsBefore)}
          />
          <Stat
            label="Active today · 7 days · 30 days"
            value={`${g.active.day} · ${g.active.week} · ${g.active.month}`}
            sub={`${fmtPercent(g.active.week, g.users)} of people this week`}
          />
          <Stat
            label="Came back in week 1"
            value={fmtPercent(g.weekOneReturn.returned, g.weekOneReturn.cohort)}
            sub={`${g.weekOneReturn.returned} of ${g.weekOneReturn.cohort} who signed up`}
          />
        </StatGrid>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Sign-ups per day">
            <ViewsChart
              buckets={series(g.series, (s) => s.signups)}
              noun={["sign-up", "sign-ups"]}
              unit="day"
            />
          </Panel>
          <Panel title="Active people per day">
            <ViewsChart
              buckets={series(g.series, (s) => s.active)}
              noun={["person", "people"]}
              unit="day"
            />
          </Panel>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Where people use Octonote">
            <SourceBar
              web={g.bySource.web}
              mobile={g.bySource.mobile}
              cli={g.bySource.cli}
              total={sourcesTotal}
            />
          </Panel>
          <Panel title="Where sign-ups came from">
            {g.signupSources.length ? (
              <dl className="grid gap-2 text-sm">
                {g.signupSources.map((s) => (
                  <Row
                    key={s.ref}
                    label={signupSourceLabel(s.ref)}
                    value={s.signups}
                  />
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                No sign-ups in this period.
              </p>
            )}
          </Panel>
        </div>
      </Section>

      <Section
        title="Revenue"
        description="Paying workspaces through Stripe, after discounts. Yearly plans count as a twelfth per month."
      >
        <StatGrid>
          <Stat
            label="Monthly revenue"
            value={fmtMoney(r.mrrCents)}
            sub={`${fmtMoney(r.mrrCents * 12)} a year`}
          />
          <Stat
            label="Paying workspaces"
            value={r.paying}
            sub={`${r.monthly} monthly · ${r.yearly} yearly`}
          />
          <Stat
            label="Free → Pro"
            value={fmtPercent(r.conversion.paying, r.conversion.workspaces)}
            sub={`${r.conversion.paying} of ${r.conversion.workspaces} workspaces`}
          />
          <Stat
            label="Needs attention"
            value={`${r.pastDue} past due`}
            sub={`${r.cancelScheduled} cancelling at period end`}
            tone={r.pastDue ? "warn" : undefined}
          />
        </StatGrid>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <Panel title="New subscriptions per day">
            <ViewsChart
              buckets={series(r.series, (s) => s.started)}
              noun={["subscription", "subscriptions"]}
              unit="day"
            />
          </Panel>
          <Panel title={`In the last ${m.days} days`}>
            <dl className="grid gap-2 text-sm">
              <Row label="New subscriptions" value={r.started} />
              <Row label="Ended" value={r.ended} />
              <Row
                label="Failed payments"
                value={r.paymentFailures}
                warn={r.paymentFailures > 0}
              />
            </dl>
          </Panel>
        </div>
      </Section>

      <Section
        title="Codes & offers"
        description="Promo codes, the free student year, and whether they turn into paying customers."
      >
        <StatGrid>
          <Stat label={`Code uses (${m.days} days)`} value={c.redemptions} />
          <Stat
            label="On Pro through a free code"
            value={c.freeActive}
            sub={`${c.studentsActive} students on their free year`}
          />
          <Stat
            label="Free code → paying"
            value={fmtPercent(c.freeToPaid.nowPaying, c.freeToPaid.redeemed)}
            sub={`${c.freeToPaid.nowPaying} of ${c.freeToPaid.redeemed} workspaces`}
          />
          <Stat
            label="Discounts per month"
            value={fmtMoney(c.discountMonthlyCents)}
            sub="Given up on current subscriptions"
          />
        </StatGrid>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="bg-card min-w-0 overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Code</TableHead>
                  <TableHead>Gives</TableHead>
                  <TableHead className="text-right">Uses</TableHead>
                  <TableHead className="pr-4 text-right">
                    {m.days} days
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.top.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground py-8 text-center text-sm"
                    >
                      No codes yet.{" "}
                      <Link href="/admin/codes" className="underline">
                        Create one
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                ) : (
                  c.top.map((t) => (
                    <TableRow
                      key={t.code}
                      className={cn(!t.enabled && "opacity-60")}
                    >
                      <TableCell className="pl-4">
                        <span className="text-foreground-strong font-mono font-semibold">
                          {t.code}
                        </span>{" "}
                        <Badge variant="outline" className="ml-1 capitalize">
                          {t.audience}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.uses}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {t.usesInRange}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Panel title={`Uses by audience (${m.days} days)`}>
            {c.byAudience.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No codes used in this period.
              </p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {c.byAudience.map((a) => (
                  <Row
                    key={a.audience}
                    label={a.audience[0]!.toUpperCase() + a.audience.slice(1)}
                    value={a.redemptions}
                  />
                ))}
              </dl>
            )}
          </Panel>
        </div>
      </Section>

      <Section
        title="Product usage"
        description="Standalone items (a project's own note and canvas count as the project)."
      >
        <StatGrid>
          <Stat
            label="Notes"
            value={u.totals.note.toLocaleString()}
            sub={`+${u.created.note} in ${m.days} days`}
          />
          <Stat
            label="Canvases"
            value={u.totals.canvas.toLocaleString()}
            sub={`+${u.created.canvas} in ${m.days} days`}
          />
          <Stat
            label="Projects"
            value={u.totals.project.toLocaleString()}
            sub={`+${u.created.project} in ${m.days} days`}
          />
          <Stat
            label="Notebooks"
            value={u.totals.notebook.toLocaleString()}
            sub={`+${u.created.notebook} in ${m.days} days`}
          />
        </StatGrid>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <Panel title="Items created per day">
            <ViewsChart
              buckets={series(
                u.series,
                (s) => s.note + s.canvas + s.project + s.notebook,
              )}
              noun={["item", "items"]}
              unit="day"
            />
          </Panel>
          <Panel title={`Sharing and the CLI`}>
            <dl className="grid gap-2 text-sm">
              <Row label="Published right now" value={u.published} />
              <Row label={`Page views (${m.days} days)`} value={u.views} />
              <Row label={`Visitors (${m.days} days)`} value={u.visitors} />
              <Row label={`People invited (${m.days} days)`} value={u.shares} />
              <Row label={`CLI users (${m.days} days)`} value={u.cliUsers} />
              <Row label="CLI tokens in use" value={u.cliTokens} />
            </dl>
          </Panel>
        </div>
      </Section>
    </>
  );
}

/** Website traffic (PostHog): visits → sign-up clicks → sign-up page → accounts. */
function TrafficSection({ t, days }: { t: AdminTraffic | null; days: number }) {
  if (t && !t.configured) return null;
  return (
    <Section
      title="Website traffic"
      description="From PostHog. Visits are browsing sessions on octonote.ai; published pages (/pub) aren't tracked. Ids in paths are grouped as :id."
    >
      {!t ? (
        <div className="grid h-24 place-items-center">
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        </div>
      ) : t.error ? (
        <p className="text-muted-foreground text-sm">{t.error}</p>
      ) : (
        <>
          <StatGrid>
            <Stat
              label={`Visits (${days} days)`}
              value={t.visits.toLocaleString()}
              sub={`${t.pageviews.toLocaleString()} page views`}
            />
            <Stat
              label="Sign-up clicks"
              value={t.signupClicks.toLocaleString()}
              sub={`${fmtPercent(t.signupClicks, t.visits)} of visits`}
            />
            <Stat
              label="Reached the sign-up page"
              value={t.signupPageVisits.toLocaleString()}
              sub={`${fmtPercent(t.signupPageVisits, t.visits)} of visits`}
            />
            <Stat
              label="Pages per visit"
              value={t.visits ? (t.pageviews / t.visits).toFixed(1) : "–"}
            />
          </StatGrid>
          <Panel title="Visits per day">
            <ViewsChart
              buckets={t.series.map((s) => ({
                start: `${s.day}T12:00:00`,
                value: s.visits,
              }))}
              noun={["visit", "visits"]}
              unit="day"
            />
          </Panel>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Top pages">
              <TopList
                rows={t.topPages.map((p) => ({ label: p.path, n: p.visits }))}
              />
            </Panel>
            <Panel title="Where visits came from">
              <TopList
                rows={t.referrers.map((r) => ({
                  label: r.domain,
                  n: r.visits,
                }))}
              />
            </Panel>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Countries">
              <TopList
                rows={t.countries.map((c) => ({
                  label: c.country,
                  n: c.visits,
                }))}
              />
            </Panel>
            <Panel title="Devices">
              <TopList
                rows={t.devices.map((d) => ({ label: d.device, n: d.visits }))}
              />
            </Panel>
          </div>
        </>
      )}
    </Section>
  );
}

/** Label + count rows with a thin bar for the share of the largest. */
function TopList({ rows }: { rows: { label: string; n: number }[] }) {
  if (!rows.length)
    return (
      <p className="text-muted-foreground text-sm">Nothing in this period.</p>
    );
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="grid gap-1.5 text-sm">
      {rows.map((r) => (
        <li
          key={r.label}
          className="relative flex items-baseline justify-between gap-3 py-0.5"
        >
          <span
            aria-hidden
            className="bg-muted absolute inset-y-0 left-0 rounded"
            style={{ width: `${(r.n / max) * 100}%` }}
          />
          <span className="text-foreground relative truncate pl-1.5">
            {r.label}
          </span>
          <span className="text-foreground-strong relative pr-1.5 font-medium tabular-nums">
            {r.n.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-foreground-strong font-medium tabular-nums",
          warn && "text-destructive",
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/** People per app as one bar split in three (people using several apps count in each). */
function SourceBar({
  web,
  mobile,
  cli,
  total,
}: {
  web: number;
  mobile: number;
  cli: number;
  total: number;
}) {
  const parts = [
    { label: "Web", n: web, className: "bg-foreground-strong" },
    { label: "Mobile", n: mobile, className: "bg-foreground-strong/55" },
    { label: "CLI & agents", n: cli, className: "bg-foreground-strong/25" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
        {total
          ? parts.map((p) => (
              <div
                key={p.label}
                className={p.className}
                style={{ width: `${(p.n / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => (
          <span
            key={p.label}
            className="text-muted-foreground inline-flex items-center gap-1.5"
          >
            <span className={cn("size-2 rounded-full", p.className)} />
            {p.label}{" "}
            <span className="text-foreground-strong font-medium tabular-nums">
              {p.n}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
