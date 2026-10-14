"use client";

/**
 * Settings → Plan & billing: the plan you're on and why (paid, a code, the
 * student year), what it costs and when it renews or ends, usage against the
 * Free limits, a code box, and — when you pay — switching monthly ⇄ yearly,
 * cancelling (and undoing it), the card (Stripe), and past invoices.
 */
import {
  FREE_LIMIT,
  PRO_PRICE,
  type BillingInvoice,
  type BillingSummary,
} from "@octonote/shared";
import {
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Ticket,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cancelSubscriptionClientApi,
  changeIntervalClientApi,
  CodeEntry,
  getBillingClientApi,
  listInvoicesClientApi,
  openBillingPortalClientApi,
  resumeSubscriptionClientApi,
  useUpgrade,
} from "@/features/billing";
import { cn } from "@/lib/utils";
import { Row, SectionShell } from "./settings-ui";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
const fmtMoney = (cents: number, currency = "usd") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
const errorText = (err: unknown, fallback: string) =>
  err instanceof Error
    ? err.message.replace(/^Octonote API \S+ \d+(?: \[[A-Z_]+\])?: /, "")
    : fallback;

type Confirm = "cancel" | "switch" | null;

export function BillingSection({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(() => {
    getBillingClientApi(workspaceId)
      .then((s) => {
        setSummary(s);
        if (s.canManage && s.source === "stripe") {
          listInvoicesClientApi(workspaceId)
            .then(setInvoices)
            .catch(() => setInvoices([]));
        }
      })
      .catch(() => setSummary(null));
  }, [workspaceId]);

  useEffect(() => {
    load();
    // Back from Stripe Checkout.
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      toast.success("Welcome to Pro — every limit is gone.");
      params.delete("billing");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
  }, [load]);

  async function run(
    label: string,
    fn: () => Promise<BillingSummary | { url: string }>,
    done?: string,
  ) {
    setBusy(label);
    try {
      const res = await fn();
      if ("url" in res) {
        window.location.href = res.url;
        return;
      }
      setSummary(res);
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorText(err, "Something went wrong."));
    } finally {
      setBusy(null);
    }
  }

  const s = summary;
  const paying = s?.source === "stripe";
  const canAct = Boolean(s?.canManage && s.billingEnabled);
  const other = s?.interval === "year" ? "month" : "year";
  const yearlySaving = PRO_PRICE.month * 12 - PRO_PRICE.year;
  const openUpgrade = (
    discount: { code: string; description: string } | null = null,
  ) => {
    useUpgrade.getState().setWorkspace(workspaceId);
    useUpgrade.getState().show(null, discount);
  };

  return (
    <SectionShell
      id="billing"
      icon={CreditCard}
      title="Plan & billing"
      description="Plans belong to the workspace. Pro removes every limit."
    >
      <Row label="Current plan" description={planLine(s)}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="font-medium">
            {s?.plan === "pro"
              ? s.source === "student"
                ? "Pro · Student"
                : s.source === "promo"
                  ? "Pro · Code"
                  : "Pro"
              : "Free"}
          </Badge>
          {paying && s?.interval ? (
            <span className="text-foreground-strong text-sm font-medium">
              {fmtMoney(s.prices[s.interval])} / {s.interval}
            </span>
          ) : null}
          {s?.promo ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
              <Ticket className="size-3.5" />
              <span className="font-mono">{s.promo.code}</span> ·{" "}
              {s.promo.description}
            </span>
          ) : null}
          {s?.status === "past_due" ? (
            <span className="text-destructive text-sm">
              Your last payment failed — update your card below.
            </span>
          ) : null}
        </div>
      </Row>

      {s?.limits ? (
        <Row
          label="Usage"
          description="Per workspace. A project's own note and canvas don't count."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["page", "Notes"],
                ["canvas", "Canvases"],
                ["project", "Projects"],
                ["notebook", "Notebooks"],
              ] as const
            ).map(([k, label]) => {
              const used = s.usage[k];
              const limit = s.limits![k];
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        used >= limit && "font-semibold",
                      )}
                    >
                      {used} / {limit}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-foreground-strong h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (used / limit) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Row>
      ) : null}

      {!s ? null : !s.billingEnabled ? (
        <Row
          label="Payments"
          description="Payments aren't set up yet — everything is free for now."
        >
          <span />
        </Row>
      ) : !s.canManage ? (
        <Row
          label="Manage"
          description="Only the workspace owner or an admin can change the plan."
        >
          <span />
        </Row>
      ) : paying ? (
        <>
          <Row
            label={`Switch to ${other === "year" ? "yearly" : "monthly"}`}
            description={
              other === "year"
                ? `$${PRO_PRICE.year}/year — save $${yearlySaving}. You pay the difference now, prorated.`
                : `$${PRO_PRICE.month}/month. The unused part of your year becomes credit.`
            }
          >
            <Button
              variant="outline"
              onClick={() => setConfirm("switch")}
              disabled={busy !== null}
            >
              {busy === "switch" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Switch to {other === "year" ? "yearly" : "monthly"}
            </Button>
          </Row>
          <Row
            label={
              s.cancelAtPeriodEnd
                ? "Cancellation scheduled"
                : "Cancel subscription"
            }
            description={
              s.cancelAtPeriodEnd
                ? `Pro ends on ${fmtDate(s.currentPeriodEnd)}. Changed your mind? Keep it.`
                : `You keep Pro until ${fmtDate(s.currentPeriodEnd)}, then the workspace returns to Free. Nothing is deleted.`
            }
          >
            {s.cancelAtPeriodEnd ? (
              <Button
                onClick={() =>
                  run(
                    "resume",
                    () => resumeSubscriptionClientApi(workspaceId),
                    "Your subscription continues.",
                  )
                }
                disabled={busy !== null}
              >
                {busy === "resume" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Keep my subscription
              </Button>
            ) : (
              <Button
                variant="outline"
                className="hover:text-destructive"
                onClick={() => setConfirm("cancel")}
                disabled={busy !== null}
              >
                Cancel subscription
              </Button>
            )}
          </Row>
          <Row
            label="Payment method"
            description="Update your card on Stripe's secure page."
          >
            <Button
              variant="outline"
              onClick={() =>
                run("portal", () => openBillingPortalClientApi(workspaceId))
              }
              disabled={busy !== null}
            >
              {busy === "portal" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Update card
            </Button>
          </Row>
        </>
      ) : (
        <Row
          label="Upgrade"
          description={`Pro is $${PRO_PRICE.month}/month or $${PRO_PRICE.year}/year per workspace.`}
        >
          <div className="flex flex-col items-start gap-3">
            <Button onClick={() => openUpgrade()}>Upgrade to Pro</Button>
            {s.source !== "promo" ? (
              <CodeEntry
                workspaceId={workspaceId}
                onFree={() => load()}
                onDiscount={(d) => openUpgrade(d)}
              />
            ) : null}
          </div>
        </Row>
      )}

      {paying && s?.canManage ? (
        <Row
          label="Invoices"
          description="Receipts for every payment, newest first."
        >
          {invoices === null ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">No invoices yet.</p>
          ) : (
            <ul className="divide-border divide-y rounded-md border">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
                >
                  <span className="text-foreground-strong tabular-nums">
                    {fmtDate(inv.date)}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {inv.number ?? "—"}
                  </span>
                  <span className="tabular-nums">
                    {fmtMoney(inv.total, inv.currency)}
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {inv.status ?? "—"}
                  </Badge>
                  <span className="ml-auto flex items-center gap-3">
                    {inv.url ? (
                      <a
                        href={inv.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground-strong text-muted-foreground inline-flex items-center gap-1 text-xs"
                      >
                        <ExternalLink className="size-3.5" /> View
                      </a>
                    ) : null}
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        className="hover:text-foreground-strong text-muted-foreground inline-flex items-center gap-1 text-xs"
                      >
                        <Download className="size-3.5" /> PDF
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Row>
      ) : null}

      <ConfirmActionDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel your subscription?"
        description={`You keep Pro until ${fmtDate(s?.currentPeriodEnd ?? null)}. After that the workspace returns to Free — nothing is deleted, and you can upgrade again any time.`}
        onConfirm={() =>
          run(
            "cancel",
            () => cancelSubscriptionClientApi(workspaceId),
            "Cancelled — Pro stays until the end of the period.",
          )
        }
      />
      <ConfirmActionDialog
        open={confirm === "switch"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Switch to ${other === "year" ? "yearly" : "monthly"} billing?`}
        description={
          other === "year"
            ? `You'll pay $${PRO_PRICE.year}/year from now on. Stripe charges the difference for the rest of this period today.`
            : `You'll pay $${PRO_PRICE.month}/month from now on. The unused part of your year becomes credit on future invoices.`
        }
        onConfirm={() =>
          run(
            "switch",
            () => changeIntervalClientApi(workspaceId, other),
            `Switched to ${other === "year" ? "yearly" : "monthly"} billing.`,
          )
        }
      />
    </SectionShell>
  );
}

function planLine(s: BillingSummary | null): string | undefined {
  if (!s) return undefined;
  const until = fmtDate(s.currentPeriodEnd);
  if (s.source === "student")
    return `Free for students until ${until}. After that, Pro is $${PRO_PRICE.month}/month.`;
  if (s.source === "promo")
    return `Pro with a code until ${until}. After that the workspace returns to Free unless you upgrade.`;
  if (s.source === "stripe") {
    if (!until) return undefined;
    return s.cancelAtPeriodEnd
      ? `Ends on ${until}.`
      : `Renews on ${until} (${s.interval === "year" ? "yearly" : "monthly"}).`;
  }
  return `Free includes ${FREE_LIMIT} of each and one workspace.`;
}
