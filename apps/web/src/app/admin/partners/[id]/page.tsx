"use client";

/**
 * Admin → Creators → one creator: their link and code, the people they
 * brought, each payment and their share, and payouts. Switching them off
 * stops new sign-ups and new earnings; what they earned stays.
 */
import { PARTNER_KIND_LABELS, type CreatorDashboard, type PartnerDetail } from "@octonote/shared";
import { ArrowLeft, Copy, Eye, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreatorSection } from "@/app/(workspace)/workspace/settings/_components/creator-section";
import { getCreatorView, getPartner, markPartnerPaidOut, updatePartner } from "@/features/admin/api";
import { PartnerDialog } from "@/features/admin/components/partner-dialog";
import { copyText, termsOf } from "@/features/admin/components/partner-format";
import { PlanBadge } from "@/features/admin/components/plan-badge";
import { errorText, fmtDate, fmtMoney, PageBody, PageHeader, Section } from "@/features/admin/components/ui";
import { ViewsChart } from "@/features/analytics/components/views-chart";
import { cn } from "@/lib/utils";

export default function AdminPartnerPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setPartner] = useState<PartnerDetail | null>(null);
  // What the creator sees: the weekly chart here, and the "See as creator" preview.
  const [view, setView] = useState<CreatorDashboard | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const setP = (next: PartnerDetail) => {
    setPartner(next);
    getCreatorView(next.id).then(setView).catch(() => setView(null));
  };
  const [editing, setEditing] = useState(false);
  const [confirmPayout, setConfirmPayout] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPartner(id)
      .then((d) => {
        setPartner(d);
        return getCreatorView(id).then(setView);
      })
      .catch((err) => toast.error(errorText(err)));
  }, [id]);

  if (!p) {
    return (
      <PageBody>
        <div className="grid place-items-center py-20">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      </PageBody>
    );
  }

  async function toggle(enabled: boolean) {
    try {
      setP(await updatePartner(p!.id, { enabled }));
      toast.success(enabled ? `${p!.name} is on again.` : `${p!.name} is off: no new sign-ups or earnings.`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function payout() {
    setBusy(true);
    try {
      setP(await markPartnerPaidOut(p!.id));
      toast.success("Marked as paid.");
      setConfirmPayout(false);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBody wide>
      <Link href="/admin/partners" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-3.5" />
        Creators
      </Link>
      <PageHeader title={p.name} description={[p.email, termsOf(p)].filter(Boolean).join(" · ")}>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{PARTNER_KIND_LABELS[p.kind]}</Badge>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Switch checked={p.enabled} onCheckedChange={toggle} aria-label="Creator on" />
            {p.enabled ? "On" : "Off"}
          </label>
          <Button variant="outline" onClick={() => setPreviewing(true)} disabled={!view}>
            <Eye className="size-3.5" />
            See as creator
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-2">
        <Copyable label="Their link" value={p.link} what="the link" mono />
        <Copyable
          label={p.promo ? `Their code · ${p.promo.description}` : "Their code"}
          value={p.code}
          what="the code"
          mono
          note={p.promo ? `${p.promo.redemptions} used${p.promo.enabled ? "" : " · code switched off"}` : "Link only, no audience offer"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sign-ups" value={p.stats.signups.toLocaleString()} />
        <Stat label="Made something" value={p.stats.activated.toLocaleString()} />
        <Stat label="Paying now" value={p.stats.paying.toLocaleString()} />
        <Stat label="Revenue" value={fmtMoney(p.stats.revenueCents)} />
        <Stat label="Earned" value={fmtMoney(p.stats.earnedCents)} />
        <div className="bg-card flex flex-col rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">Owed</p>
          <p className="text-foreground-strong mt-1 text-2xl font-bold tabular-nums">{fmtMoney(p.stats.owedCents)}</p>
          {p.stats.owedCents > 0 ? (
            <Button size="sm" variant="outline" className="mt-2 self-start" onClick={() => setConfirmPayout(true)}>
              Mark as paid
            </Button>
          ) : null}
        </div>
      </div>

      {p.note ? <p className="text-muted-foreground text-sm">{p.note}</p> : null}

      {view ? (
        <Section title="Sign-ups per week" description="The last 12 weeks. The creator sees this chart too.">
          <div className="bg-card rounded-lg border p-4">
            <ViewsChart
              buckets={view.weekly.map((w) => ({ start: `${w.week}T12:00:00Z`, value: w.signups }))}
              noun={["sign-up", "sign-ups"]}
              unit="week"
            />
          </div>
        </Section>
      ) : null}

      <Section title="People they brought" description="Joined through their link or used their code. The first creator who brought someone keeps them.">
        <div className="bg-card overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Through</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Made</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="pr-4 text-right">Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.referrals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                    Nobody yet. Share their link: {p.link}
                  </TableCell>
                </TableRow>
              ) : (
                p.referrals.map((r) => (
                  <TableRow key={r.user.id}>
                    <TableCell className="pl-4">
                      <Link href={`/admin/users/${r.user.id}`} className="text-foreground-strong font-medium hover:underline">
                        {r.user.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">{r.user.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.via === "link" ? "Link" : "Code"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(r.joinedAt)}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{fmtDate(r.lastActive)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.madeItems === 0 && "text-muted-foreground")}>
                      {r.madeItems}
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={r.plan} />
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{fmtMoney(r.paidCents)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section
        title="Payments and their share"
        description="Every paid invoice from people they brought. Payments after their window earn no share but still count as revenue."
      >
        <div className="bg-card overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Paid on</TableHead>
                <TableHead>Person</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Their share</TableHead>
                <TableHead className="pr-4">Paid out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No payments yet.
                  </TableCell>
                </TableRow>
              ) : (
                p.commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground pl-4 whitespace-nowrap">{fmtDate(c.paidAt)}</TableCell>
                    <TableCell>{c.user ? `${c.user.name} · ${c.user.email}` : "Deleted account"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(c.amountPaidCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(c.commissionCents)}</TableCell>
                    <TableCell className="text-muted-foreground pr-4 whitespace-nowrap">
                      {c.commissionCents === 0 ? "—" : c.paidOutAt ? fmtDate(c.paidOutAt) : "Owed"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>What {p.name} sees</DialogTitle>
            <DialogDescription>
              {p.email
                ? `Settings → Creator program, when ${p.email} signs in to Octonote.`
                : "Add their email (the one they sign in with) so they can see this in Settings → Creator program."}
            </DialogDescription>
          </DialogHeader>
          {view ? <CreatorSection creator={view} /> : null}
        </DialogContent>
      </Dialog>

      <PartnerDialog open={editing} onOpenChange={setEditing} partner={p} onSaved={setP} />

      <Dialog open={confirmPayout} onOpenChange={setConfirmPayout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {fmtMoney(p.stats.owedCents)} as paid?</DialogTitle>
            <DialogDescription>
              Do this after you've paid {p.name}. Everything owed today is marked as paid out, with the date, in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPayout(false)}>
              Cancel
            </Button>
            <Button onClick={payout} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}

function Copyable({ label, value, what, mono, note }: { label: string; value: string; what: string; mono?: boolean; note?: string }) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className={cn("text-foreground-strong mt-1 truncate text-lg", mono && "font-mono")}>{value}</p>
        {note ? <p className="text-muted-foreground mt-0.5 text-xs">{note}</p> : null}
      </div>
      <Button variant="outline" size="sm" onClick={() => copyText(value, what)}>
        <Copy className="size-3.5" />
        Copy
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-foreground-strong mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
