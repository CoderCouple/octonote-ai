"use client";

/** Admin → a person: their workspaces and plans, and how they use Octonote. */
import type { AdminUserDetail } from "@octonote/shared";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getAdminUser } from "@/features/admin/api";
import { PlanBadge } from "@/features/admin/components/plan-badge";
import { errorText, fmtDate, PageBody, PageHeader, Panel, Stat, StatGrid } from "@/features/admin/components/ui";

const APP: Record<string, string> = { web: "Web", mobile: "Mobile", cli: "CLI & agents" };

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminUser(id).then(setU).catch((err) => setError(errorText(err)));
  }, [id]);

  return (
    <PageBody>
      <Link href="/admin/users" className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        People
      </Link>
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !u ? (
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      ) : (
        <>
          <PageHeader title={u.name} description={u.email}>
            <span className="inline-flex gap-1.5">
              {u.isAdmin ? <Badge variant="outline">Admin</Badge> : null}
              <Badge variant={u.pro ? "default" : "outline"}>{u.pro ? "Pro" : "Free"}</Badge>
            </span>
          </PageHeader>
          <StatGrid>
            <Stat label="Joined" value={fmtDate(u.createdAt)} />
            <Stat label="Last active" value={u.lastActive ? fmtDate(`${u.lastActive}T12:00:00`) : "—"} />
            <Stat label="Active days (30)" value={u.activeDays30} sub={u.sources.map((s) => APP[s]).join(" · ") || "No activity yet"} />
            <Stat
              label="Student year"
              value={u.studentProUntil ? `Until ${fmtDate(u.studentProUntil)}` : "—"}
              sub={`${u.cliTokens} CLI token${u.cliTokens === 1 ? "" : "s"}`}
            />
          </StatGrid>
          <Panel title="Workspaces">
            <ul className="divide-y">
              {u.memberships.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/admin/workspaces/${m.id}`} className="text-foreground-strong font-medium hover:underline">
                      {m.name}
                    </Link>
                    <span className="text-muted-foreground ml-2 text-xs capitalize">{m.role.toLowerCase()}</span>
                  </div>
                  <PlanBadge plan={m.plan} />
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-muted-foreground font-mono text-xs">{u.id}</p>
        </>
      )}
    </PageBody>
  );
}
