"use client";

/**
 * Admin → Creators: influencers and creators who bring people to Octonote.
 * Each has a unique code (their link, octonote.ai/?ref=priya, and their
 * audience's promo code), and this page shows who they brought, who pays, and
 * what they've earned.
 */
import { PARTNER_KIND_LABELS, PARTNER_KINDS, type Partner, type PartnerKind } from "@octonote/shared";
import { Copy, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPartners } from "@/features/admin/api";
import { PartnerDialog } from "@/features/admin/components/partner-dialog";
import { copyText, termsOf } from "@/features/admin/components/partner-format";
import { errorText, fmtMoney, PageBody, PageHeader } from "@/features/admin/components/ui";
import { cn } from "@/lib/utils";

export default function AdminPartnersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Partner[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PartnerKind | "all">("all");
  const shown = useMemo(() => (rows ?? []).filter((p) => kind === "all" || p.kind === kind), [rows, kind]);

  useEffect(() => {
    listPartners().then(setRows).catch((err) => toast.error(errorText(err)));
  }, []);

  const total = (k: keyof Partner["stats"]) => shown.reduce((n, p) => n + p.stats[k], 0);

  return (
    <PageBody wide>
      <PageHeader
        title="Creators"
        description="Influencers and creators who bring people to Octonote. Each gets a unique code: a link that counts everyone they bring, and an offer for their audience."
      >
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add creator
        </Button>
      </PageHeader>

      {rows === null ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : (
        <>
          <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind | "all")}>
            <SelectTrigger className="w-48" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {PARTNER_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {PARTNER_KIND_LABELS[k]} ({(rows ?? []).filter((p) => p.kind === k).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Sign-ups from creators" value={total("signups").toLocaleString()} />
            <Stat label="Made something" value={total("activated").toLocaleString()} />
            <Stat label="Paying now" value={total("paying").toLocaleString()} />
            <Stat label="Owed to creators" value={fmtMoney(total("owedCents"))} />
          </div>

          <div className="bg-card overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Creator</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Their share</TableHead>
                  <TableHead>Audience offer</TableHead>
                  <TableHead className="text-right">Sign-ups</TableHead>
                  <TableHead className="text-right">Made something</TableHead>
                  <TableHead className="text-right">Paying</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="pr-4 text-right">Owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground py-10 text-center">
                      {rows.length === 0 ? "No creators yet. Add one to get their link and code." : "No creators of this type."}
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((p) => (
                    <TableRow
                      key={p.id}
                      className={cn("cursor-pointer", !p.enabled && "opacity-60")}
                      onClick={() => router.push(`/admin/partners/${p.id}`)}
                    >
                      <TableCell className="pl-4">
                        <Link href={`/admin/partners/${p.id}`} className="text-foreground-strong font-medium hover:underline">
                          {p.name}
                        </Link>
                        {!p.enabled ? <Badge variant="outline" className="ml-2">Off</Badge> : null}
                        {p.email ? <p className="text-muted-foreground text-xs">{p.email}</p> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PARTNER_KIND_LABELS[p.kind]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{p.code}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0"
                            aria-label={`Copy ${p.name}'s link`}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(p.link, `${p.name}'s link`);
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{termsOf(p)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.promo ? `${p.promo.description} · ${p.promo.redemptions} used` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.stats.signups}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stats.activated}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.stats.paying}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.stats.revenueCents)}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{fmtMoney(p.stats.owedCents)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <PartnerDialog
        open={adding}
        onOpenChange={setAdding}
        partner={null}
        onSaved={(p) => router.push(`/admin/partners/${p.id}`)}
      />
    </PageBody>
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
