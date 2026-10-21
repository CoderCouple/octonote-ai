"use client";

/**
 * Settings → Creator program, for people we partner with (matched by the
 * email on their creator record). Their link and code, how many people
 * they've brought, and what they've earned. Counts only: never who those
 * people are.
 */
import type { CreatorDashboard } from "@octonote/shared";
import { Handshake } from "lucide-react";
import { ViewsChart } from "@/features/analytics/components/views-chart";
import { CopyButton, Row, SectionShell } from "./settings-ui";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );

export function CreatorSection({ creator }: { creator: CreatorDashboard }) {
  const term =
    creator.commissionMonths === null ? "for as long as they pay" : `for their first ${creator.commissionMonths} months`;
  return (
    <SectionShell
      id="creator"
      icon={Handshake}
      title="Creator program"
      description="Your link and code, the people you've brought to Octonote, and what you've earned."
    >
      {!creator.enabled ? (
        <p className="text-muted-foreground mb-3 rounded-lg border p-4 text-sm">
          Your creator link is paused right now, so new sign-ups aren't counted. Write to hello@octonote.ai if that's a surprise.
        </p>
      ) : null}
      <div className="divide-y rounded-lg border">
        <Row label="Your link" description="Share it anywhere. Anyone who signs up within 30 days of opening it counts as yours.">
          <div className="flex min-w-0 items-center gap-2">
            <code className="bg-muted truncate rounded px-2 py-1 text-sm">{creator.link}</code>
            <CopyButton value={creator.link} />
          </div>
        </Row>
        <Row
          label="Your code"
          description={creator.offer ? `Your audience enters it in Plan & billing: ${creator.offer}.` : "People can enter it when they sign up."}
        >
          <div className="flex items-center gap-2">
            <code className="bg-muted rounded px-2 py-1 font-mono text-sm">{creator.code}</code>
            <CopyButton value={creator.code} />
          </div>
        </Row>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Signed up" value={creator.signups.toLocaleString()} />
        <Stat label="Made something" value={creator.activated.toLocaleString()} />
        <Stat label="Paying" value={creator.paying.toLocaleString()} />
      </div>

      <div className="mt-4 rounded-lg border p-4">
        <p className="text-foreground text-sm font-medium">Sign-ups per week</p>
        <p className="text-muted-foreground text-xs">The last 12 weeks.</p>
        <div className="mt-3">
          <ViewsChart
            buckets={creator.weekly.map((w) => ({ start: `${w.week}T12:00:00Z`, value: w.signups }))}
            noun={["sign-up", "sign-ups"]}
            unit="week"
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border p-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Earned" value={money(creator.earnedCents)} plain />
          <Stat label="Paid to you" value={money(creator.paidOutCents)} plain />
          <Stat label="Still owed" value={money(creator.owedCents)} plain />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          You earn {creator.commissionPercent}% of what the people you bring pay, {term}. We pay out by hand: write to
          hello@octonote.ai with questions.
        </p>
      </div>
    </SectionShell>
  );
}

function Stat({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className={plain ? "" : "rounded-lg border p-4"}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
