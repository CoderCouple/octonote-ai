"use client";

/** Admin → People: find anyone by email, name or id (a workspace id opens that workspace). */
import type { AdminUserRow } from "@octonote/shared";
import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchAdminUsers } from "@/features/admin/api";
import { errorText, fmtDate, PageBody, PageHeader } from "@/features/admin/components/ui";

export default function AdminUsersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (/^wsp_[0-9a-f-]{36}$/.test(term)) {
      router.push(`/admin/workspaces/${term}`);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchAdminUsers(term)
        .then((r) => live && (setRows(r), setError(null)))
        .catch((err) => live && setError(errorText(err)));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, router]);

  return (
    <PageBody>
      <PageHeader title="People" description="Search by email, name, or a user or workspace id. Newest sign-ups first." />
      <div className="relative max-w-md">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id="admin-user-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="alice@example.com"
          className="pl-9"
          aria-label="Search people"
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Person</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="hidden md:table-cell">Workspaces</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead className="pr-4">Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                  Nobody matches “{q}”.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => router.push(`/admin/users/${u.id}`)}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/users/${u.id}`} className="text-foreground-strong font-medium hover:underline">
                      {u.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs">{u.email}</span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex gap-1.5">
                      <Badge variant={u.pro ? "default" : "outline"}>{u.pro ? "Pro" : "Free"}</Badge>
                      {u.isAdmin ? <Badge variant="outline">Admin</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{u.workspaces}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{fmtDate(u.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground pr-4">{u.lastActive ? fmtDate(`${u.lastActive}T12:00:00`) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}
