"use client";

/**
 * Admin → Feedback: bug reports and feature requests from the apps, to work
 * through later. Each one carries who sent it, their workspace and plan, the
 * device, page, time and rough location, plus a screenshot if they added one
 * (a private file, shown through a link that expires). Status and team notes
 * are audited; the person never sees either.
 */
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUSES,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackStatus,
} from "@octonote/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getFeedbackItem,
  listFeedback,
  updateFeedbackItem,
} from "@/features/admin/api";
import { errorText, fmtDateTime, PageBody, PageHeader } from "@/features/admin/components/ui";
import { cn } from "@/lib/utils";

type StatusFilter = "open" | "all" | FeedbackStatus;
type KindFilter = "all" | FeedbackKind;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  ...FEEDBACK_STATUSES.map((s) => ({ id: s, label: FEEDBACK_STATUS_LABEL[s] })),
  { id: "all", label: "All" },
];
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "Bugs and features" },
  { id: "bug", label: "Bugs" },
  { id: "feature", label: "Features" },
];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-8 rounded-full border px-3 text-[13px] transition-colors",
        on
          ? "bg-primary text-primary-foreground border-primary font-semibold"
          : "hover:bg-muted font-medium",
      )}
    >
      {children}
    </button>
  );
}

function Detail({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  if (!children) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-xs")}>{children}</dd>
    </>
  );
}

function FeedbackInner() {
  const params = useSearchParams();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<string | null>(params.get("f"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFeedback()
      .then((r) => setItems(r.items))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  const shown = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          (status === "all" ||
            (status === "open" ? i.status === "new" || i.status === "planned" : i.status === status)) &&
          (kind === "all" || i.kind === kind),
      ),
    [items, status, kind],
  );

  const onChanged = useCallback(
    (next: FeedbackItem) =>
      setItems((all) => (all ?? []).map((i) => (i.id === next.id ? next : i))),
    [],
  );

  return (
    <PageBody wide>
      <PageHeader title="Feedback" description="Bug reports and feature requests from the apps." />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Reports" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Pill key={f.id} on={status === f.id} onClick={() => setStatus(f.id)}>
                {f.label}
              </Pill>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {KIND_FILTERS.map((f) => (
              <Pill key={f.id} on={kind === f.id} onClick={() => setKind(f.id)}>
                {f.label}
              </Pill>
            ))}
          </div>
          <div className="border-t">
            {items === null && !error ? (
              <p className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : null}
            {items !== null && shown.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">Nothing here.</p>
            ) : null}
            {shown.map((i) => (
              <button
                key={i.id}
                type="button"
                aria-current={selected === i.id}
                onClick={() => setSelected(i.id)}
                className={cn(
                  "hover:bg-muted/50 block w-full border-b px-2.5 py-3 text-left",
                  selected === i.id && "bg-muted/70",
                )}
              >
                <span className="flex justify-between gap-3 text-xs">
                  <span className="font-semibold">{FEEDBACK_KIND_LABEL[i.kind]}</span>
                  <span className="text-muted-foreground">{fmtDateTime(i.createdAt)}</span>
                </span>
                <span className="text-foreground-strong my-1 line-clamp-2 block text-sm font-medium">{i.message}</span>
                <span className="text-muted-foreground flex justify-between gap-3 text-[13px]">
                  <span className="truncate">
                    {i.email}
                    {i.hasScreenshot ? " · screenshot" : ""}
                  </span>
                  <span className="text-foreground shrink-0 font-medium">{FEEDBACK_STATUS_LABEL[i.status]}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Selected report" className="min-w-0">
          {selected ? (
            <ReportDetail key={selected} id={selected} onChanged={onChanged} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">Choose a report to read it.</p>
          )}
        </section>
      </div>
    </PageBody>
  );
}

function ReportDetail({ id, onChanged }: { id: string; onChanged: (item: FeedbackItem) => void }) {
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getFeedbackItem(id)
      .then((r) => {
        if (!live) return;
        setItem(r);
        setNote(r.teamNote ?? "");
      })
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [id]);

  async function save(change: { status?: FeedbackStatus; teamNote?: string }) {
    setSaving(true);
    try {
      const next = await updateFeedbackItem(id, change);
      setItem(next);
      onChanged(next);
      toast.success("Saved");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!item) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  const place = [item.city, item.region, item.country].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-foreground-strong font-semibold">{FEEDBACK_KIND_LABEL[item.kind]}</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="feedback-status" className="text-muted-foreground font-normal">
            Status
          </Label>
          <Select
            value={item.status}
            disabled={saving}
            onValueChange={(v) => void save({ status: v as FeedbackStatus })}
          >
            <SelectTrigger id="feedback-status" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {FEEDBACK_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-foreground-strong whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {item.message}
      </p>

      {item.screenshotUrl ? (
        <a href={item.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind an expiring link */}
          <img
            src={item.screenshotUrl}
            alt="Screenshot sent with this report"
            className="max-h-[320px] w-full rounded-lg border object-contain"
          />
        </a>
      ) : null}

      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        <Detail label="From">
          <Link href={`/admin/users/${item.userId}`} className="underline underline-offset-4">
            {item.email}
          </Link>
        </Detail>
        <Detail label="User ID" mono>
          {item.userId}
        </Detail>
        <Detail label="Workspace">
          {item.workspaceName ? (
            <>
              {item.workspaceName} · <span className="font-mono text-xs">{item.workspaceId}</span>
            </>
          ) : null}
        </Detail>
        <Detail label="Plan">{item.plan}</Detail>
        <Detail label="Page">{item.page}</Detail>
        <Detail label="Platform">{item.platform}</Detail>
        <Detail label="Device">{[item.device, item.system].filter(Boolean).join(" · ")}</Detail>
        <Detail label="Window">{item.screen}</Detail>
        <Detail label="App version">{item.appVersion}</Detail>
        <Detail label="Time">
          {fmtDateTime(item.createdAt)}
          {item.timeZone ? ` · they're in ${item.timeZone}` : ""}
        </Detail>
        <Detail label="Location">{place ? `${place} (approximate)` : null}</Detail>
      </dl>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-note">
          Team note <span className="text-muted-foreground font-normal">(they never see this)</span>
        </Label>
        <Textarea
          id="feedback-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why, who has it, what's next"
        />
        {note !== (item.teamNote ?? "") ? (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={saving}
            onClick={() => void save({ teamNote: note })}
          >
            Save note
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/admin/inbox?p=${item.userId}`}>Reply from Inbox</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/admin/users/${item.userId}`}>Open their person page</Link>
        </Button>
      </div>
    </div>
  );
}

export default function AdminFeedbackPage() {
  return (
    <Suspense>
      <FeedbackInner />
    </Suspense>
  );
}
