"use client";

/**
 * Admin → a workspace: plan and billing, members, usage, codes, grants and
 * subscription history. Actions: give or extend Pro, end a grant early, and
 * cancel the subscription now (with an optional refund). Each one is written
 * to the audit log with the reason given here.
 */
import type { AdminWorkspaceDetail } from "@octonote/shared";
import { ArrowLeft, ExternalLink, Gift, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelSubscriptionNow, endGrant, getAdminWorkspace, grantPro } from "@/features/admin/api";
import { PlanBadge } from "@/features/admin/components/plan-badge";
import { errorText, fmtDate, fmtMoney, PageBody, PageHeader, Panel, Stat, StatGrid } from "@/features/admin/components/ui";

const HISTORY: Record<string, string> = {
  started: "Subscription started",
  cancel_scheduled: "Set to cancel at period end",
  resumed: "Cancellation undone",
  ended: "Subscription ended",
  interval_changed: "Switched billing period",
  past_due: "Payment overdue",
  payment_failed: "Payment failed",
};

export default function AdminWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [w, setW] = useState<AdminWorkspaceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"grant" | "cancel" | null>(null);

  useEffect(() => {
    getAdminWorkspace(id).then(setW).catch((err) => setError(errorText(err)));
  }, [id]);

  async function onEndGrant(grantId: string) {
    try {
      setW(await endGrant(grantId));
      toast.success("Grant ended.");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <PageBody>
      <Link href="/admin/users" className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        People
      </Link>
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !w ? (
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      ) : (
        <>
          <PageHeader title={w.name} description={`Created ${fmtDate(w.createdAt)}`}>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog("grant")}>
                <Gift className="size-4" />
                {w.plan.source === "grant" ? "Extend Pro" : "Give Pro"}
              </Button>
              {w.billing.hasSubscription ? (
                <Button variant="outline" className="text-destructive" onClick={() => setDialog("cancel")}>
                  <XCircle className="size-4" />
                  Cancel subscription now
                </Button>
              ) : null}
            </div>
          </PageHeader>

          <Panel title="Plan">
            <div className="flex flex-col gap-2 text-sm">
              <PlanBadge plan={w.plan} />
              {w.billing.status ? (
                <p className="text-muted-foreground">
                  Stripe: {w.billing.status}
                  {w.billing.interval ? `, ${w.billing.interval}ly` : ""}
                  {w.billing.currentPeriodEnd ? `, period ends ${fmtDate(w.billing.currentPeriodEnd)}` : ""}
                  {w.billing.cancelAtPeriodEnd ? " (cancelling)" : ""}
                </p>
              ) : null}
              {w.billing.stripeUrl ? (
                <a
                  href={w.billing.stripeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground inline-flex w-fit items-center gap-1 underline-offset-4 hover:underline"
                >
                  Open in Stripe <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </Panel>

          <StatGrid>
            <Stat label="Notes" value={w.usage.page} />
            <Stat label="Canvases" value={w.usage.canvas} />
            <Stat label="Projects" value={w.usage.project} />
            <Stat label="Notebooks" value={w.usage.notebook} sub={`${w.published} published items`} />
          </StatGrid>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Members">
              <ul className="divide-y text-sm">
                {w.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <Link href={`/admin/users/${m.userId}`} className="min-w-0 hover:underline">
                      <span className="text-foreground-strong font-medium">{m.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">{m.email}</span>
                    </Link>
                    <span className="text-muted-foreground text-xs capitalize">{m.role.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Codes used">
              {w.codes.length === 0 ? (
                <p className="text-muted-foreground text-sm">None.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {w.codes.map((c) => (
                    <li key={`${c.code}-${c.createdAt}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <span>
                        <span className="text-foreground-strong font-mono font-semibold">{c.code}</span>{" "}
                        <span className="text-muted-foreground">{c.description}</span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {fmtDate(c.createdAt)}
                        {c.proUntil ? ` → ${fmtDate(c.proUntil)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Pro given by Octonote">
              {w.grants.length === 0 ? (
                <p className="text-muted-foreground text-sm">None.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {w.grants.map((g) => {
                    const running = !g.endedAt && new Date(g.proUntil) > new Date();
                    return (
                      <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-foreground-strong">
                            {g.months} month{g.months === 1 ? "" : "s"} · until {fmtDate(g.proUntil)}
                            {g.endedAt ? <span className="text-muted-foreground"> · ended {fmtDate(g.endedAt)}</span> : null}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {g.reason} — {g.grantedBy ?? "unknown"}, {fmtDate(g.createdAt)}
                          </p>
                        </div>
                        {running ? (
                          <Button size="sm" variant="ghost" onClick={() => onEndGrant(g.id)}>
                            End now
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
            <Panel title="Subscription history">
              {w.history.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing yet (recorded since Oct 14, 2026).</p>
              ) : (
                <ul className="divide-y text-sm">
                  {w.history.map((e, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <span className={e.kind === "payment_failed" || e.kind === "past_due" ? "text-destructive" : "text-foreground"}>
                        {HISTORY[e.kind] ?? e.kind}
                        {e.kind === "interval_changed" && e.interval ? ` to ${e.interval}ly` : ""}
                        {e.amountCents ? ` (${fmtMoney(e.amountCents)})` : ""}
                      </span>
                      <span className="text-muted-foreground text-xs">{fmtDate(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <p className="text-muted-foreground font-mono text-xs">{w.id}</p>

          <GrantDialog
            open={dialog === "grant"}
            onOpenChange={(o) => !o && setDialog(null)}
            workspace={w}
            onDone={(next) => {
              setW(next);
              setDialog(null);
            }}
          />
          <CancelDialog
            open={dialog === "cancel"}
            onOpenChange={(o) => !o && setDialog(null)}
            workspace={w}
            onDone={(next) => {
              setW(next);
              setDialog(null);
            }}
          />
        </>
      )}
    </PageBody>
  );
}

function GrantDialog({
  open,
  onOpenChange,
  workspace,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: AdminWorkspaceDetail;
  onDone: (w: AdminWorkspaceDetail) => void;
}) {
  const [months, setMonths] = useState("3");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(months);
  const valid = Number.isInteger(n) && n >= 1 && n <= 36 && reason.trim().length >= 3;
  const extending = workspace.plan.plan === "pro" && workspace.plan.source !== "stripe" && workspace.plan.until;

  async function submit() {
    setBusy(true);
    try {
      onDone(await grantPro(workspace.id, { months: n, reason: reason.trim() }));
      toast.success(`Pro given for ${n} month${n === 1 ? "" : "s"}.`);
      setReason("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{extending ? "Extend Pro" : "Give Pro"}</DialogTitle>
          <DialogDescription>
            {extending
              ? `Adds months after the current free Pro ends (${fmtDate(workspace.plan.until)}).`
              : "Pro starts now, with no card. It doesn't touch any Stripe subscription."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="grant-months">Months</Label>
            <Input id="grant-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} className="w-28" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="grant-reason">Reason (for the audit log)</Label>
            <Textarea id="grant-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Beta tester, found the sharing bug" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Give {Number.isInteger(n) && n > 0 ? `${n} month${n === 1 ? "" : "s"}` : "Pro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  workspace,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: AdminWorkspaceDetail;
  onDone: (w: AdminWorkspaceDetail) => void;
}) {
  const [refund, setRefund] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      onDone(await cancelSubscriptionNow(workspace.id, { refundLastPayment: refund, reason: reason.trim() }));
      toast.success(refund ? "Subscription cancelled and last payment refunded." : "Subscription cancelled.");
      setReason("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the subscription now?</DialogTitle>
          <DialogDescription>
            Pro ends immediately for {workspace.name}, not at the end of the period. Nothing in the workspace is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label htmlFor="cancel-refund" className="flex items-center gap-2 text-sm">
            <Checkbox id="cancel-refund" checked={refund} onCheckedChange={(c) => setRefund(c === true)} />
            Refund the last payment in full
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-reason">Reason (for the audit log)</Label>
            <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Test purchase" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={reason.trim().length < 3 || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Cancel now{refund ? " and refund" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
