"use client";

/**
 * People → a person: their follow-up status at a glance (status, owner, next
 * follow-up, last conversation, activity), with a way into the Inbox.
 */
import { CRM_KIND_LABELS, CRM_STATUS_LABELS, type CrmPersonDetail } from "@octonote/shared";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getCrmPerson } from "../api";
import { ActivityStrip } from "./crm-charts";
import { dueLabel } from "./crm-person";
import { fmtDate, Panel } from "./ui";

export function CrmPanel({ userId }: { userId: string }) {
  const [p, setP] = useState<CrmPersonDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getCrmPerson(userId).then(setP).catch(() => setFailed(true));
  }, [userId]);

  if (failed) return null;
  if (!p) return <Panel title="Follow-up">…</Panel>;

  const next = p.followups.find((f) => !f.doneAt);
  const lastTalk = [...p.timeline].reverse().find((t) => t.type === "entry");
  return (
    <Panel title="Follow-up">
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            <span className="text-muted-foreground">Status </span>
            <strong className="text-foreground-strong font-semibold">{CRM_STATUS_LABELS[p.status]}</strong>
          </span>
          <span>
            <span className="text-muted-foreground">Looked after by </span>
            <strong className="text-foreground-strong font-semibold">{p.owner?.name ?? "nobody yet"}</strong>
          </span>
          <span>
            <span className="text-muted-foreground">Came from </span>
            <strong className="text-foreground-strong font-semibold">{p.source}</strong>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span>
            <span className="text-muted-foreground">Next follow-up </span>
            {next ? (
              <strong className="text-foreground-strong font-semibold">
                {next.note} · {dueLabel(next.dueOn)}
              </strong>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </span>
          <span>
            <span className="text-muted-foreground">Last conversation </span>
            {lastTalk && lastTalk.type === "entry" ? (
              <strong className="text-foreground-strong font-semibold">
                {CRM_KIND_LABELS[lastTalk.kind]} · {fmtDate(lastTalk.at)}
              </strong>
            ) : (
              <span className="text-muted-foreground">never</span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActivityStrip activity={p.activity} />
          <Button asChild size="sm">
            <Link href={`/admin/inbox?p=${userId}`}>
              <Inbox className="size-3.5" />
              Open in Inbox
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}
