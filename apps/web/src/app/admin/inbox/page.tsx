"use client";

/**
 * Admin → Inbox: the follow-ups CRM. A list of everyone who signed up
 * (folders, status chips, search) beside the open person's follow-ups and
 * timeline, where staff email people, log conversations and set follow-ups.
 * Phones show one pane at a time.
 */
import { CRM_STATUS_LABELS, CRM_STATUSES, type CrmPersonDetail, type CrmPersonRow, type CrmStatus } from "@octonote/shared";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getCrmPerson, listCrmPeople, listCrmStaff, markCrmSeen } from "@/features/admin/api";
import { CrmPerson, dayFromToday, dueLabel } from "@/features/admin/components/crm-person";
import { errorText } from "@/features/admin/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Folder = "attention" | "new" | "sent" | "all";
const FOLDERS: { id: Folder; label: string }[] = [
  { id: "attention", label: "Needs attention" },
  { id: "new", label: "Not contacted" },
  { id: "sent", label: "Sent" },
  { id: "all", label: "Everyone" },
];

/** Their reply is waiting on us, or a follow-up is due today or earlier. */
const needsAttention = (r: CrmPersonRow) =>
  r.needsReply || (r.nextFollowup !== null && r.nextFollowup.dueOn <= dayFromToday(0));

const inFolder = (r: CrmPersonRow, f: Folder) =>
  f === "all" ? true : f === "new" ? !r.contacted : f === "sent" ? r.emailed : needsAttention(r);

const shortWhen = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function AdminInboxPage() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("p");
  const [rows, setRows] = useState<CrmPersonRow[] | null>(null);
  const [person, setPerson] = useState<CrmPersonDetail | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("attention");
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<string>("all");

  const reload = useCallback(() => listCrmPeople().then(setRows).catch((err) => toast.error(errorText(err))), []);

  useEffect(() => {
    void reload();
    listCrmStaff().then(setStaff).catch(() => {});
    void createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => setMeId(data.session ? `usr_${data.session.user.id}` : null));
  }, [reload]);

  // Start on the folder that has something in it.
  useEffect(() => {
    if (rows && folder === "attention" && !rows.some(needsAttention)) setFolder(rows.some((r) => !r.contacted) ? "new" : "all");
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows === null]);

  useEffect(() => {
    if (!openId) return setPerson(null);
    getCrmPerson(openId).then(setPerson).catch((err) => toast.error(errorText(err)));
    // Opening someone reads their replies; refresh the list's unread dots.
    markCrmSeen(openId)
      .then(() => setRows((rs) => rs?.map((r) => (r.user.id === openId ? { ...r, unread: false } : r)) ?? rs))
      .catch(() => {});
  }, [openId]);

  const open = (id: string | null) => router.replace(id ? `/admin/inbox?p=${id}` : "/admin/inbox", { scroll: false });

  const mine = useCallback(
    (r: CrmPersonRow) => owner === "all" || (owner === "none" ? !r.owner : r.owner?.id === owner),
    [owner],
  );
  const inView = useMemo(() => (rows ?? []).filter((r) => mine(r) && inFolder(r, folder)), [rows, folder, mine]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inView
      .filter((r) => !status || r.status === status)
      .filter((r) => !needle || r.user.name.toLowerCase().includes(needle) || r.user.email.toLowerCase().includes(needle))
      .sort((a, b) =>
        folder === "attention"
          ? (a.nextFollowup?.dueOn ?? "9999").localeCompare(b.nextFollowup?.dueOn ?? "9999")
          : (b.last?.at ?? "").localeCompare(a.last?.at ?? ""),
      );
  }, [inView, status, q, folder]);

  function changed(p: CrmPersonDetail) {
    setPerson(p);
    void reload();
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0">
      <section
        aria-label="People"
        className={cn("flex min-h-0 w-full flex-col border-r md:w-[350px] md:shrink-0", openId && "max-md:hidden")}
      >
        <div className="flex flex-col gap-2.5 border-b px-4 pt-3 pb-3">
          <h1 className="text-foreground-strong text-base font-semibold">Inbox</h1>
          <div role="tablist" aria-label="Folders" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {FOLDERS.map((f) => {
              const n = (rows ?? []).filter((r) => mine(r) && inFolder(r, f.id)).length;
              const on = folder === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setFolder(f.id);
                    setStatus(null);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs whitespace-nowrap transition-colors",
                    on ? "bg-background text-foreground-strong font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] leading-4 font-semibold",
                      f.id === "attention" && n > 0 ? "bg-foreground-strong text-background" : "text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to search…"
              aria-label="Search people"
              className="h-8 min-w-0 flex-1"
            />
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              aria-label="Looked after by"
              className="bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="all">Everyone</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === meId ? "Mine" : s.name.split(" ")[0]}
                </option>
              ))}
              <option value="none">No owner</option>
            </select>
          </div>
          <div role="group" aria-label="Status" className="flex gap-1.5 overflow-x-auto pb-0.5">
            {[null, ...CRM_STATUSES].map((s) => {
              const n = s ? inView.filter((r) => r.status === s).length : inView.length;
              if (s && n === 0) return null;
              const on = status === s;
              return (
                <button
                  key={s ?? "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "h-6 shrink-0 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors",
                    on ? "bg-foreground-strong text-background border-foreground-strong" : "hover:bg-muted text-foreground",
                  )}
                >
                  {s ? CRM_STATUS_LABELS[s] : "All"} <span className="opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              {folder === "attention" ? "Nothing needs attention. Nice work." : "Nobody here."}
            </p>
          ) : (
            shown.map((r) => {
              const active = r.user.id === openId;
              const due = r.nextFollowup ? dueLabel(r.nextFollowup.dueOn) : null;
              return (
                <button
                  key={r.user.id}
                  type="button"
                  onClick={() => open(r.user.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "block w-full border-b px-4 py-3 text-left transition-colors",
                    active ? "bg-muted shadow-[inset_3px_0_0_var(--foreground-strong)]" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {r.unread ? <span aria-label="Unread reply" className="bg-foreground-strong size-2 shrink-0 rounded-full" /> : null}
                    <span className={cn("text-foreground-strong truncate text-sm", r.unread ? "font-bold" : "font-medium")}>
                      {r.user.name}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">{r.last ? shortWhen(r.last.at) : ""}</span>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{r.user.email}</p>
                  {r.last && r.last.kind !== "event" ? (
                    <p className={cn("mt-1 line-clamp-2 text-xs leading-relaxed", r.unread ? "text-foreground" : "text-muted-foreground")}>
                      {r.last.kind === "email_in" ? "" : r.last.kind === "email_out" ? "You: " : ""}
                      {r.last.title && (r.last.kind === "email_in" || r.last.kind === "email_out") ? `${r.last.title} · ` : ""}
                      {r.last.preview}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-px text-[11px] font-medium">
                      {CRM_STATUS_LABELS[r.status]}
                    </span>
                    {r.needsReply ? (
                      <span className="bg-foreground-strong text-background rounded px-1.5 py-px text-[11px] font-medium">Needs reply</span>
                    ) : null}
                    {due ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-px text-[11px] font-medium",
                          due === "Today" || due.endsWith("late") ? "bg-foreground-strong text-background" : "border text-muted-foreground",
                        )}
                      >
                        {due}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground rounded border px-1.5 py-px text-[11px]">{r.source}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <div className={cn("flex min-h-0 min-w-0 flex-1", !openId && "max-md:hidden")}>
        {person && person.user.id === openId ? (
          <CrmPerson person={person} staff={staff} meId={meId} onChange={changed} onBack={() => open(null)} />
        ) : openId ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : (
          <div className="text-muted-foreground grid flex-1 place-items-center p-8 text-center text-sm">
            Pick someone on the left to see their timeline and follow-ups.
          </div>
        )}
      </div>
    </div>
  );
}
