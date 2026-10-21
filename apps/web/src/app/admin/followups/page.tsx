"use client";

/**
 * Admin → Follow-ups: the CRM at a glance. Totals, the pipeline by status,
 * outreach and replies per week, and the day's lists (due, waiting on us, not
 * contacted, coming up), for everyone or one staff member. Each person opens
 * in the Inbox.
 */
import { CRM_STATUS_LABELS, type CrmOverview } from "@octonote/shared";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getCrmOverview, listCrmStaff, updateCrmFollowup } from "@/features/admin/api";
import { OutreachChart, PipelineChart } from "@/features/admin/components/crm-charts";
import { dueLabel } from "@/features/admin/components/crm-person";
import { errorText, fmtDate, PageBody, PageHeader } from "@/features/admin/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const inbox = (userId: string) => `/admin/inbox?p=${userId}`;

export default function AdminFollowupsPage() {
  const [data, setData] = useState<CrmOverview | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(8);

  const load = useCallback(
    () => getCrmOverview(owner, weeks).then(setData).catch((err) => toast.error(errorText(err))),
    [owner, weeks],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listCrmStaff().then(setStaff).catch(() => {});
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data: d }) => setMeId(d.session ? `usr_${d.session.user.id}` : null));
  }, []);

  async function done(followupId: string) {
    try {
      await updateCrmFollowup(followupId, { done: true });
      toast.success("Done.");
      void load();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const people = [{ id: null as string | null, label: "Everyone" }].concat(
    staff.map((s) => ({ id: s.id, label: s.id === meId ? "Mine" : s.name.split(" ")[0]! })),
  );

  return (
    <PageBody wide>
      <PageHeader title="Follow-ups" description="Who to talk to today, and how outreach is going. Work top to bottom.">
        <div role="group" aria-label="Show follow-ups for" className="bg-muted flex gap-1 rounded-lg p-1">
          {people.map((p) => (
            <button
              key={p.id ?? "all"}
              type="button"
              aria-pressed={owner === p.id}
              onClick={() => setOwner(p.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                owner === p.id ? "bg-background text-foreground-strong font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {data === null ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Due today or late" value={data.counts.due} strong={data.counts.due > 0} />
            <Stat label="Replied, waiting on us" value={data.counts.waitingOnUs} strong={data.counts.waitingOnUs > 0} />
            <Stat label="Not contacted yet" value={data.counts.notContacted} />
            <Stat label="Coming up this week" value={data.counts.comingUp} />
          </div>

          <div className="flex flex-wrap gap-4">
            <section className="bg-card min-w-0 flex-[1_1_360px] rounded-lg border p-4">
              <h2 className="text-foreground-strong text-base font-semibold">Pipeline</h2>
              <p className="text-muted-foreground mb-4 text-xs">Everyone who signed up, by status</p>
              <PipelineChart pipeline={data.pipeline} />
            </section>
            <section className="bg-card min-w-0 flex-[2_1_520px] rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-foreground-strong text-base font-semibold">Outreach and replies</h2>
                  <p className="text-muted-foreground text-xs">
                    Emails and logged messages sent, and replies, per week · reply rate, last 30 days:{" "}
                    <strong className="text-foreground-strong">
                      {data.replyRate30d === null ? "—" : `${Math.round(data.replyRate30d * 100)}%`}
                    </strong>
                  </p>
                </div>
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  aria-label="How many weeks"
                  className="bg-background h-8 rounded-md border px-2 text-xs"
                >
                  <option value={8}>Last 8 weeks</option>
                  <option value={12}>Last 12 weeks</option>
                  <option value={26}>Last 6 months</option>
                </select>
              </div>
              <OutreachChart weekly={data.weekly} />
            </section>
          </div>

          <ListSection title="Due today and late" empty="Nothing due. Nice work.">
            {data.due.map((d) => (
              <Row key={d.followup.id} href={inbox(d.person.id)}>
                <button
                  type="button"
                  aria-label={`Mark "${d.followup.note}" done`}
                  onClick={(e) => {
                    e.preventDefault();
                    void done(d.followup.id);
                  }}
                  className="hover:bg-muted grid size-6 shrink-0 place-items-center rounded border"
                >
                  <Check className="text-muted-foreground size-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground-strong truncate text-sm font-medium">{d.followup.note}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {d.person.name} · {CRM_STATUS_LABELS[d.status]}
                    {d.followup.assignedTo ? ` · ${d.followup.assignedTo.name.split(" ")[0]}` : ""}
                  </p>
                </div>
                <DueTag dueOn={d.followup.dueOn} />
              </Row>
            ))}
          </ListSection>

          <ListSection title="Replied, waiting on us" empty="No replies waiting.">
            {data.waitingOnUs.map((w) => (
              <Row key={w.person.id} href={inbox(w.person.id)}>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground-strong truncate text-sm font-medium">
                    {w.person.name} <span className="text-muted-foreground font-normal">replied {fmtDate(w.at)}</span>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {w.subject ? `${w.subject} · ` : ""}“{w.preview}”
                  </p>
                </div>
                <span className="bg-foreground-strong text-background shrink-0 rounded-md px-3 py-1.5 text-xs font-medium">Answer</span>
              </Row>
            ))}
          </ListSection>

          <ListSection title="Not contacted yet" note="Signed up in the last 30 days, nothing in their timeline" empty="Everyone's been contacted.">
            {data.notContacted.map((n) => (
              <Row key={n.person.id} href={inbox(n.person.id)}>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground-strong truncate text-sm font-medium">{n.person.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {n.person.email} · joined {fmtDate(n.joinedAt)} · {n.source}
                  </p>
                </div>
                <span className="text-foreground shrink-0 rounded-md border px-3 py-1.5 text-xs">Say hello</span>
              </Row>
            ))}
          </ListSection>

          <ListSection title="Coming up" note="The next 7 days" empty="Nothing planned this week.">
            {data.comingUp.map((c) => (
              <Row key={c.followup.id} href={inbox(c.person.id)}>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground-strong truncate text-sm">
                    <span className="font-medium">{c.person.name}</span> · {c.followup.note}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {dueLabel(c.followup.dueOn)}
                  {c.followup.assignedTo ? ` · ${c.followup.assignedTo.name.split(" ")[0]}` : ""}
                </span>
              </Row>
            ))}
          </ListSection>
        </>
      )}
    </PageBody>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", strong ? "text-foreground-strong" : "text-foreground")}>{value}</p>
    </div>
  );
}

function ListSection({ title, note, empty, children }: { title: string; note?: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-foreground-strong text-base font-semibold">{title}</h2>
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </div>
      <div className="bg-card overflow-hidden rounded-lg border">
        {children.length ? children : <p className="text-muted-foreground px-4 py-6 text-center text-sm">{empty}</p>}
      </div>
    </section>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="hover:bg-muted/50 flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      {children}
    </Link>
  );
}

function DueTag({ dueOn }: { dueOn: string }) {
  const label = dueLabel(dueOn);
  const late = label.endsWith("late");
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-0.5 text-xs font-semibold",
        late ? "bg-foreground-strong text-background" : "bg-muted text-foreground",
      )}
    >
      {label}
    </span>
  );
}
