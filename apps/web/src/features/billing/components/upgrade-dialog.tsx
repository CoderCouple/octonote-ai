"use client";

/**
 * The upgrade prompt. Opens when a create hits a free limit, from the
 * once-a-day nudge (any kind at its limit), or from an Upgrade button.
 * Monthly/yearly toggle → Stripe Checkout.
 */
import {
  FREE_LIMIT,
  PRO_PRICE,
  type BillingInterval,
  type BillingSummary,
  type LimitedKind,
} from "@octonote/shared";
import { Check, Loader2, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getBillingClientApi, startCheckoutClientApi } from "../api";
import { useUpgrade, type UpgradeReason } from "../upgrade-store";
import { CodeEntry } from "./code-entry";

const NOUN: Record<LimitedKind, string> = {
  page: "notes",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};

function headline(reason: UpgradeReason) {
  if (reason === "workspace") return "The Free plan includes one workspace";
  if (reason) return `You've used your ${FREE_LIMIT} free ${NOUN[reason]}`;
  return "Upgrade to Pro";
}

const PRO_FEATURES = [
  "Unlimited notes, canvases, projects and notebooks",
  "Unlimited workspaces",
  "Everything in Free: sharing, publishing, analytics, math and diagrams",
];

export function UpgradeDialog() {
  const { open, reason, workspaceId, hide, discount } = useUpgrade();
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let live = true;
    getBillingClientApi(workspaceId)
      .then((s) => live && setSummary(s))
      .catch(() => live && setSummary(null));
    return () => {
      live = false;
    };
  }, [open, workspaceId]);

  async function upgrade() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const { url } = await startCheckoutClientApi(
        workspaceId,
        interval,
        discount?.code,
      );
      window.location.href = url;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't start checkout.",
      );
      setBusy(false);
    }
  }

  const yearlySaving = PRO_PRICE.month * 12 - PRO_PRICE.year;
  const canUpgrade = summary
    ? summary.canManage && summary.billingEnabled
    : true;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : hide())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{headline(reason)}</DialogTitle>
          <DialogDescription>
            Upgrade to Pro to keep going — no limits on anything you create.
          </DialogDescription>
        </DialogHeader>

        {summary?.limits ? (
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(NOUN) as LimitedKind[]).map((k) => {
              const used = summary.usage[k];
              const limit = summary.limits![k];
              const full = used >= limit;
              return (
                <div key={k} className="rounded-lg border px-3 py-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground capitalize">
                      {NOUN[k]}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        full && "text-foreground-strong font-semibold",
                      )}
                    >
                      {used}/{limit}
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
        ) : null}

        <div
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
          role="radiogroup"
          aria-label="Billing period"
        >
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                interval === i
                  ? "bg-background text-foreground-strong shadow-sm"
                  : "text-muted-foreground hover:text-foreground-strong",
              )}
            >
              {i === "month" ? "Monthly" : `Yearly · save $${yearlySaving}`}
            </button>
          ))}
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-foreground-strong text-3xl font-semibold tracking-tight">
              ${PRO_PRICE[interval]}
            </span>
            <span className="text-muted-foreground text-sm">
              / {interval === "month" ? "month" : "year"} per workspace
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="text-foreground-strong mt-0.5 size-4 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {discount ? (
          <p className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <Ticket className="size-4 shrink-0" />
            <span>
              <b className="font-mono">{discount.code}</b> —{" "}
              {discount.description}. Applied at checkout.
            </span>
          </p>
        ) : workspaceId && canUpgrade ? (
          <CodeEntry
            workspaceId={workspaceId}
            onDiscount={(d) => useUpgrade.setState({ discount: d })}
            onFree={() => {
              hide();
              router.refresh();
            }}
          />
        ) : null}

        {summary && !summary.canManage ? (
          <p className="text-muted-foreground text-sm">
            Only the workspace owner or an admin can upgrade. Ask them to
            upgrade this workspace.
          </p>
        ) : summary && !summary.billingEnabled ? (
          <p className="text-muted-foreground text-sm">
            Payments aren&apos;t set up yet.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={hide} disabled={busy}>
            Not now
          </Button>
          <Button
            onClick={upgrade}
            disabled={busy || !canUpgrade || !workspaceId}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Upgrade to Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
