"use client";

/**
 * Admin → Inbox, the right pane: one person's status, follow-ups and timeline
 * (what we know + conversations logged by staff), and a box to log a new one.
 * Emails go out from hello@octonote.ai as the signed-in staff member, with a
 * copy to the team inbox; replies come back into the timeline (and a copy to
 * the team inbox) once reply.octonote.ai is set up.
 */
import {
  CRM_KIND_LABELS,
  CRM_TEMPLATES,
  fillCrmTemplate,
  CRM_LOG_KINDS,
  CRM_STATUS_LABELS,
  CRM_STATUSES,
  type CrmLogKind,
  type CrmPersonDetail,
  type CrmStatus,
  type CrmTimelineItem,
} from "@octonote/shared";
import { ArrowLeft, Check, Loader2, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addCrmFollowup, deleteCrmEntry, logCrmEntry, sendCrmEmail, setCrmOwner, setCrmStatus, updateCrmFollowup } from "../api";
import { PlanBadge } from "./plan-badge";
import { errorText, fmtDate } from "./ui";

/** YYYY-MM-DD in the viewer's own time zone, `days` from today. */
export function dayFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", "2 days late", "Fri, Oct 30". */
export function dueLabel(dueOn: string) {
  const today = dayFromToday(0);
  if (dueOn === today) return "Today";
  if (dueOn === dayFromToday(1)) return "Tomorrow";
  const days = Math.round((Date.parse(today) - Date.parse(dueOn)) / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} late`;
  return new Date(`${dueOn}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const NOBODY = "nobody";

const QUICK_DATES: [string, number][] = [
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["Next week", 7],
];

export function CrmPerson({
  person,
  staff,
  meId,
  onChange,
  onBack,
}: {
  person: CrmPersonDetail;
  staff: { id: string; name: string }[];
  meId: string | null;
  /** Called with the updated person after any change. */
  onChange: (p: CrmPersonDetail) => void;
  /** Phones: back to the list. */
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"email" | "log">("email");
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState<CrmLogKind>("linkedin");
  const [body, setBody] = useState("");
  const [on, setOn] = useState(dayFromToday(0));
  const [busy, setBusy] = useState<string | null>(null);
  const [fNote, setFNote] = useState("");
  const [fDue, setFDue] = useState(dayFromToday(3));
  const [fTo, setFTo] = useState<string>(meId ?? "");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBody("");
    setSubject("");
    setFNote("");
    endRef.current?.scrollIntoView({ block: "end" });
  }, [person.user.id]);

  async function run(key: string, fn: () => Promise<CrmPersonDetail>, done?: string) {
    setBusy(key);
    try {
      onChange(await fn());
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const first = (name: string) => name.split(/\s+/)[0] ?? name;
  const meName = first(staff.find((s) => s.id === meId)?.name ?? "");

  function applyTemplate(id: string) {
    const t = CRM_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSubject(fillCrmTemplate(t.subject, first(person.user.name), meName));
    setBody(fillCrmTemplate(t.body, first(person.user.name), meName));
  }

  async function send(remind: boolean) {
    const ok = await run("send", () => sendCrmEmail(person.user.id, { subject, body }), `Sent to ${person.user.email}.`);
    if (!ok) return;
    const sentSubject = subject;
    setSubject("");
    setBody("");
    if (remind) {
      await run("follow", () =>
        addCrmFollowup(person.user.id, { dueOn: dayFromToday(3), note: `Follow up on “${sentSubject.slice(0, 80)}”` }),
        "Follow-up added for 3 days from now.",
      );
    }
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  async function addLog(remind: boolean) {
    // A day picked in the past means that day at noon; today means now.
    const occurredAt = on === dayFromToday(0) ? undefined : new Date(`${on}T12:00:00`).toISOString();
    const ok = await run("log", () => logCrmEntry(person.user.id, { kind, body, occurredAt }));
    if (!ok) return;
    setBody("");
    if (remind) {
      await run("follow", () =>
        addCrmFollowup(person.user.id, { dueOn: dayFromToday(3), note: `Follow up on: ${body.slice(0, 80)}` }),
        "Added, with a follow-up in 3 days.",
      );
    }
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  const open = person.followups.filter((f) => !f.doneAt);
  const done = person.followups.filter((f) => f.doneAt);
  const made = [
    [person.made.notes, "note"],
    [person.made.canvases, "canvas"],
    [person.made.projects, "project"],
    [person.made.notebooks, "notebook"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? "" : w === "canvas" ? "es" : "s"}`)
    .join(" · ");

  return (
    <section aria-label={`Conversation with ${person.user.name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 md:px-5">
        <Button variant="ghost" size="sm" className="size-8 p-0 md:hidden" aria-label="Back to the list" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="bg-muted text-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold" aria-hidden>
          {person.user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-foreground-strong truncate text-[15px] font-semibold">{person.user.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {person.user.email} · joined {fmtDate(person.joinedAt)} · {person.source}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={person.status}
            onValueChange={(v) => run("status", () => setCrmStatus(person.user.id, v as CrmStatus))}
          >
            <SelectTrigger className="h-8 w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CRM_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={person.owner?.id ?? NOBODY}
            onValueChange={(v) => run("owner", () => setCrmOwner(person.user.id, v === NOBODY ? null : v))}
          >
            <SelectTrigger className="h-8 w-36" aria-label="Looked after by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>No owner</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name.split(" ")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/users/${person.user.id}`}>Full profile</Link>
          </Button>
        </div>
      </div>

      <div className="bg-sidebar text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 border-b px-4 py-2 text-xs md:px-5">
        <span className="flex items-center gap-1.5">
          Plan <PlanBadge plan={person.plan} />
        </span>
        <span>
          Made <strong className="text-foreground-strong font-semibold">{made || "nothing yet"}</strong>
        </span>
        <span>
          Active <strong className="text-foreground-strong font-semibold">{person.activeDays} of the last 30 days</strong>
          {person.lastActive ? ` · last ${fmtDate(person.lastActive)}` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b px-4 py-3 md:px-5">
          <p className="text-foreground-strong mb-2 text-sm font-semibold">Follow-ups</p>
          {open.length === 0 && done.length === 0 ? (
            <p className="text-muted-foreground mb-2 text-sm">None yet.</p>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {[...open, ...done.slice(0, 3)].map((f) => (
              <li key={f.id} className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={Boolean(f.doneAt)}
                  aria-label={f.doneAt ? `Mark "${f.note}" not done` : `Mark "${f.note}" done`}
                  onChange={() => run(`f-${f.id}`, () => updateCrmFollowup(f.id, { done: !f.doneAt }))}
                />
                <span className={cn("min-w-0 flex-1", f.doneAt ? "text-muted-foreground line-through" : "text-foreground-strong")}>
                  {f.note}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                    f.doneAt
                      ? "text-muted-foreground"
                      : dueLabel(f.dueOn).endsWith("late") || dueLabel(f.dueOn) === "Today"
                        ? "bg-foreground-strong text-background"
                        : "bg-muted text-foreground",
                  )}
                >
                  {f.doneAt ? `Done ${fmtDate(f.doneAt)}` : dueLabel(f.dueOn)}
                  {f.assignedTo && !f.doneAt ? ` · ${f.assignedTo.name.split(" ")[0]}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                "follow",
                () => addCrmFollowup(person.user.id, { dueOn: fDue, note: fNote, assignedToUserId: fTo || null }),
                "Follow-up added.",
              );
              if (ok) setFNote("");
            }}
          >
            <Input
              value={fNote}
              onChange={(e) => setFNote(e.target.value)}
              placeholder="Remind me to…"
              aria-label="Follow-up"
              className="h-8 min-w-48 flex-1"
            />
            <div className="flex gap-1">
              {QUICK_DATES.map(([label, days]) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={fDue === dayFromToday(days) ? "default" : "outline"}
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => setFDue(dayFromToday(days))}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} aria-label="Due" className="h-8 w-36" />
            {staff.length > 1 ? (
              <Select value={fTo} onValueChange={setFTo}>
                <SelectTrigger className="h-8 w-32" aria-label="For">
                  <SelectValue placeholder="For…" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      For {s.name.split(" ")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button type="submit" size="sm" className="h-8" disabled={!fNote.trim() || !fDue || busy === "follow"}>
              {busy === "follow" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Add
            </Button>
          </form>
        </div>

        <ol className="flex flex-col gap-3 px-4 py-4 md:px-5" aria-label="Timeline">
          {person.timeline.map((t, i) => (
            <TimelineItem
              key={t.type === "entry" ? t.id : `${t.title}-${i}`}
              item={t}
              onDelete={
                t.type === "entry" && (CRM_LOG_KINDS as readonly string[]).includes(t.kind)
                  ? () => {
                      if (window.confirm("Remove this from the timeline?"))
                        void run(`d-${t.id}`, () => deleteCrmEntry(t.id), "Removed from the timeline.");
                    }
                  : undefined
              }
            />
          ))}
          <div ref={endRef} />
        </ol>
      </div>

      <form
        className="flex flex-col gap-2 border-t px-4 py-3 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void (mode === "email" ? send(false) : addLog(false));
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Reply as" className="bg-muted flex gap-0.5 rounded-lg p-0.5">
            {(["email", "log"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs transition-colors",
                  mode === m ? "bg-background text-foreground-strong font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "email" ? "Email" : "Log a conversation"}
              </button>
            ))}
          </div>
          {mode === "email" ? (
            <div role="group" aria-label="Templates" className="flex flex-wrap gap-1.5">
              {CRM_TEMPLATES.map((t) => (
                <Button key={t.id} type="button" size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs" onClick={() => applyTemplate(t.id)}>
                  {t.label}
                </Button>
              ))}
            </div>
          ) : (
            <div role="group" aria-label="What kind" className="flex flex-wrap gap-1.5">
              {CRM_LOG_KINDS.map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={kind === k ? "default" : "outline"}
                  className="h-7 rounded-full px-3 text-xs"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                >
                  {CRM_KIND_LABELS[k]}
                </Button>
              ))}
            </div>
          )}
        </div>
        {mode === "email" ? (
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className="h-8" />
        ) : null}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={mode === "email" ? 6 : 3}
          aria-label={mode === "email" ? "Message" : "What was said"}
          placeholder={
            mode === "email"
              ? `Write to ${first(person.user.name)}… or pick a template`
              : kind === "note"
                ? "A note about this person…"
                : `What was said on ${CRM_KIND_LABELS[kind]}…`
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && (mode === "log" || subject.trim())) {
              e.preventDefault();
              void (mode === "email" ? send(false) : addLog(false));
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {mode === "email" ? (
            <span className="text-muted-foreground text-xs">
              From {meName || "you"} at hello@octonote.ai to {person.user.email} · copies of this and the reply go to hello@
            </span>
          ) : (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              When
              <Input type="date" value={on} max={dayFromToday(0)} onChange={(e) => setOn(e.target.value)} className="h-8 w-36" />
            </label>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!body.trim() || (mode === "email" && !subject.trim()) || busy !== null}
              onClick={() => (mode === "email" ? send(true) : addLog(true))}
            >
              {mode === "email" ? "Send + remind me in 3 days" : "Add + remind me in 3 days"}
            </Button>
            <Button type="submit" size="sm" disabled={!body.trim() || (mode === "email" && !subject.trim()) || busy !== null}>
              {busy === "log" || busy === "send" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : mode === "email" ? (
                <Send className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
              {mode === "email" ? "Send" : "Add to timeline"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function TimelineItem({ item, onDelete }: { item: CrmTimelineItem; onDelete?: () => void }) {
  if (item.type === "event") {
    return (
      <li className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span>
          {item.title} · {fmtDate(item.at)}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </li>
    );
  }
  const inbound = item.kind === "email_in";
  return (
    <li className={cn("group flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3.5 py-3",
          inbound
            ? "bg-background border shadow-xs"
            : item.kind === "email_out"
              ? "bg-muted border border-transparent"
              : "border border-dashed",
        )}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
              inbound ? "bg-foreground-strong text-background" : "bg-muted text-muted-foreground",
            )}
          >
            {CRM_KIND_LABELS[item.kind]}
          </span>
          <span className="text-foreground-strong text-xs font-semibold">{item.by?.name ?? ""}</span>
          <span className="text-muted-foreground ml-auto text-xs">{when(item.at)}</span>
          {onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Remove from the timeline"
              onClick={onDelete}
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
        {item.subject ? <p className="text-foreground mb-1 text-sm font-medium">{item.subject}</p> : null}
        <p className="text-foreground text-sm leading-relaxed whitespace-pre-line">{item.body}</p>
      </div>
    </li>
  );
}
