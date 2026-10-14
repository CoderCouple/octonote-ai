"use client";

/** Admin → Audit log: every change made in the admin portal, newest first. */
import type { AdminAuditEntry } from "@octonote/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAdminAudit } from "@/features/admin/api";
import { errorText, fmtDateTime, PageBody, PageHeader } from "@/features/admin/components/ui";

const ACTION: Record<string, string> = {
  "promo.create": "Created code",
  "promo.enable": "Switched code on",
  "promo.disable": "Switched code off",
  "grant.create": "Gave Pro",
  "grant.end": "Ended a Pro grant",
  "subscription.cancel": "Cancelled subscription now",
  "student_domain.add": "Added student email ending",
  "student_domain.enable": "Switched student ending on",
  "student_domain.disable": "Switched student ending off",
};

const PAGE = 50;

function detailText(e: AdminAuditEntry): string {
  const d = e.details ?? {};
  const parts: string[] = [];
  if (typeof d.months === "number") parts.push(`${d.months} month${d.months === 1 ? "" : "s"}`);
  if (typeof d.description === "string") parts.push(d.description);
  if (typeof d.refundedCents === "number" && d.refundedCents > 0) parts.push(`refunded $${(d.refundedCents / 100).toFixed(2)}`);
  if (typeof d.reason === "string") parts.push(`“${d.reason}”`);
  return parts.join(" · ");
}

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AdminAuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const page = await listAdminAudit(before);
      setRows((prev) => (before ? [...(prev ?? []), ...page] : page));
      setMore(page.length === PAGE);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageBody>
      <PageHeader title="Audit log" description="Every change made in the admin portal: who, what and why." />
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="pr-4">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  Nothing yet. Changes made here will appear in this list.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground pl-4 whitespace-nowrap">{fmtDateTime(e.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.actorEmail}</TableCell>
                  <TableCell>
                    {ACTION[e.action] ?? e.action}
                    {e.targetLabel ? (
                      <>
                        {" · "}
                        {e.targetKind === "workspace" && e.targetId ? (
                          <Link href={`/admin/workspaces/${e.targetId}`} className="text-foreground-strong font-medium hover:underline">
                            {e.targetLabel}
                          </Link>
                        ) : (
                          <span className="text-foreground-strong font-medium">{e.targetLabel}</span>
                        )}
                      </>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground pr-4">{detailText(e)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {more ? (
        <Button variant="outline" className="w-fit" disabled={loading} onClick={() => load(rows?.at(-1)?.createdAt)}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Show older
        </Button>
      ) : null}
    </PageBody>
  );
}
