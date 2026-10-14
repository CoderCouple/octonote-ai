"use client";

/**
 * Admin → Student emails: the email endings that get the free student year
 * on first sign-in ("edu", "ac.uk", or one school like "ox.ac.uk"). Switching
 * one off stops new sign-ups getting it; students already on it keep it.
 */
import type { StudentDomain } from "@octonote/shared";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addStudentDomain, listStudentDomains, setStudentDomainEnabled } from "@/features/admin/api";
import { errorText, fmtDate, PageBody, PageHeader } from "@/features/admin/components/ui";
import { cn } from "@/lib/utils";

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<StudentDomain[] | null>(null);
  const [suffix, setSuffix] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listStudentDomains().then(setRows).catch((err) => toast.error(errorText(err)));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setRows(await addStudentDomain({ suffix, label: label.trim() || undefined }));
      toast.success(`Added ${suffix.replace(/^[.@]+/, "").toLowerCase()}.`);
      setSuffix("");
      setLabel("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(d: StudentDomain, enabled: boolean) {
    try {
      setRows(await setStudentDomainEnabled(d.id, enabled));
      toast.success(`${d.suffix} ${enabled ? "switched on" : "switched off"}.`);
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Student emails"
        description="People who sign up with an email ending in one of these get Pro free for 12 months. Switching one off only affects new sign-ups."
      />
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <label htmlFor="student-suffix" className="text-muted-foreground text-xs">
            Email ending
          </label>
          <Input id="student-suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="ac.uk" className="w-44" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <label htmlFor="student-label" className="text-muted-foreground text-xs">
            Note (optional)
          </label>
          <Input id="student-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="UK universities" className="max-w-xs" />
        </div>
        <Button type="submit" disabled={!suffix.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </form>
      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Ending</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Students now</TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="pr-4 text-right">On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((d) => (
                <TableRow key={d.id} className={cn(!d.enabled && "opacity-60")}>
                  <TableCell className="pl-4 font-mono">.{d.suffix}</TableCell>
                  <TableCell className="text-muted-foreground">{d.label ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.activeStudents}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{fmtDate(d.createdAt)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Switch checked={d.enabled} onCheckedChange={(on) => toggle(d, on)} aria-label={`${d.suffix} on`} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}
