"use client";

import { STUDIO_KIND_LABEL, STUDIO_SOURCE_LABEL, type StudioItem } from "@octonote/shared";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Code2,
  Copy,
  Ellipsis,
  Eye,
  FilePlus2,
  Link2,
  Loader2,
  RotateCw,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RESOURCE_PATH } from "@/features/sharing";
import { cn } from "@/lib/utils";
import { AI_SETTINGS_PATH, errorText, needsAiKey, studioApi, type SourceCandidate } from "./api";
import { KIND_ICON, KindBadge, SOURCE_ICON, StatusBadge, since } from "./kinds";
import { StudioPreview } from "./studio-preview";

/** One studio item: the result, its source, and sharing and adding it to a note. */
export function StudioItemView({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<StudioItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [raw, setRaw] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setItem(await studioApi.get(id));
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while it's being made.
  useEffect(() => {
    if (item?.status !== "running") return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [item?.status, load]);

  if (missing)
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-foreground-strong text-xl font-semibold">This item isn&apos;t here</h1>
        <p className="text-muted-foreground mt-2 text-sm">It may have been deleted.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/workspace/studio">Back to Studio</Link>
        </Button>
      </div>
    );
  if (!item)
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 md:px-8">
        <div className="bg-muted h-6 w-40 animate-pulse rounded" />
        <div className="bg-muted h-10 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-[420px] animate-pulse rounded-2xl" />
      </div>
    );

  const retry = async () => {
    try {
      setItem(await studioApi.retry(item.id));
    } catch (e) {
      const message = errorText(e);
      toast.error(message, needsAiKey(message) ? { action: { label: "Open Settings", onClick: () => router.push(AI_SETTINGS_PATH) } } : undefined);
    }
  };

  const ready = item.status === "succeeded" && !!item.spec;
  const SourceIcon = SOURCE_ICON[item.sourceType];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/workspace/studio" className="hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-4" />
          Studio
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground truncate">{item.title}</span>
      </nav>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={item.kind} label={STUDIO_KIND_LABEL[item.kind]} />
            <span className="text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium">
              <SourceIcon className="size-3.5" />
              {STUDIO_SOURCE_LABEL[item.sourceType]}
            </span>
            <StatusBadge status={item.status} />
            {item.published ? (
              <span className="text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium">
                <Link2 className="size-3.5" />
                Shared by link
              </span>
            ) : null}
          </div>
          <EditableTitle item={item} onSaved={setItem} />
          <p className="text-muted-foreground mt-1 text-sm">
            Made {since(item.createdAt)}
            {item.durationMs && item.status === "succeeded" ? ` in ${Math.max(1, Math.round(item.durationMs / 1000))}s` : ""} from {item.sourceLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ready ? (
            <>
              <Button variant="ghost" onClick={() => setRaw((r) => !r)} className="gap-2" aria-pressed={raw}>
                {raw ? <Eye className="size-4" /> : <Code2 className="size-4" />}
                {raw ? "Preview" : "Raw"}
              </Button>
              <Button variant="ghost" onClick={() => setSharing(true)} className="gap-2">
                <Share2 className="size-4" />
                Share
              </Button>
              <Button onClick={() => setAdding(true)} className="gap-2">
                <FilePlus2 className="size-4" />
                Add to note
              </Button>
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={item.status === "running"} onSelect={() => void retry()}>
                <RotateCw className="size-4" />
                Make it again
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="bg-card mt-6 rounded-2xl border shadow-xs">
        {item.status === "running" ? (
          <Making kind={item.kind} since={item.updatedAt} />
        ) : item.status === "failed" ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="border-destructive/30 text-destructive grid size-11 place-items-center rounded-xl border">
              <CircleAlert className="size-5" />
            </div>
            <h2 className="text-foreground-strong mt-4 font-semibold">This couldn&apos;t be made</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm">{item.error ?? "Something went wrong."}</p>
            <div className="mt-5 flex gap-2">
              {needsAiKey(item.error) ? (
                <Button asChild>
                  <Link href={AI_SETTINGS_PATH}>Add your Anthropic key</Link>
                </Button>
              ) : null}
              <Button variant={needsAiKey(item.error) ? "outline" : "default"} onClick={() => void retry()} className="gap-2">
                <RotateCw className="size-4" />
                Try again
              </Button>
            </div>
          </div>
        ) : raw ? (
          <RawJson item={item} />
        ) : item.spec ? (
          <div className="p-4 md:p-6">
            <StudioPreview id={item.id} kind={item.kind} spec={item.spec} />
          </div>
        ) : null}
      </section>

      <SourcePanel item={item} />

      <ShareDialog item={item} open={sharing} onOpenChange={setSharing} onChange={setItem} />
      <AddToNoteDialog item={item} open={adding} onOpenChange={setAdding} />
      <ConfirmActionDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this item?"
        description={`“${item.title}” will be deleted. Notes you've already added it to keep their copy.`}
        onConfirm={async () => {
          await studioApi.remove(item.id);
          toast.success("Deleted");
          router.push("/workspace/studio");
        }}
      />
    </div>
  );
}

function EditableTitle({ item, onSaved }: { item: StudioItem; onSaved: (item: StudioItem) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.title);
  useEffect(() => setValue(item.title), [item.title]);
  const save = async () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === item.title) return setValue(item.title);
    try {
      onSaved(await studioApi.rename(item.id, next));
    } catch (e) {
      toast.error(errorText(e));
      setValue(item.title);
    }
  };
  return editing ? (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") {
          setValue(item.title);
          setEditing(false);
        }
      }}
      maxLength={120}
      autoFocus
      aria-label="Title"
      className="text-foreground-strong mt-3 w-full rounded-md bg-transparent text-2xl font-bold tracking-tight outline-none md:text-3xl"
    />
  ) : (
    <h1 className="mt-3">
      <button type="button" onClick={() => setEditing(true)} title="Rename" className="text-foreground-strong hover:bg-muted/60 -mx-1 rounded-md px-1 text-left text-2xl font-bold tracking-tight md:text-3xl">
        {item.title}
      </button>
    </h1>
  );
}

/** While the AI works: what it's making, how long it's taken, and a skeleton of the result. */
function Making({ kind, since: start }: { kind: StudioItem["kind"]; since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - new Date(start).getTime()) / 1000));
  const Icon = KIND_ICON[kind];
  const steps = ["Reading the source", "Picking the main ideas", `Building the ${STUDIO_KIND_LABEL[kind].toLowerCase()}`, "Checking it"];
  const at = Math.min(steps.length - 1, Math.floor(seconds / 8));
  return (
    <div className="px-6 py-14">
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <div className="bg-muted relative grid size-12 place-items-center rounded-xl border">
          <Icon className="size-5" />
          <Loader2 className="text-muted-foreground absolute -right-1.5 -bottom-1.5 size-4 animate-spin" />
        </div>
        <h2 className="text-foreground-strong mt-4 font-semibold">Making your {STUDIO_KIND_LABEL[kind].toLowerCase()}</h2>
        <p className="text-muted-foreground mt-1 text-sm tabular-nums">{seconds}s · usually under a minute. You can leave this page.</p>
        <ol className="mt-6 w-full space-y-2 text-left text-sm">
          {steps.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2.5", i > at ? "text-muted-foreground/60" : i < at ? "text-muted-foreground" : "text-foreground-strong font-medium")}>
              {i < at ? <Check className="size-4" /> : i === at ? <Loader2 className="size-4 animate-spin" /> : <span className="border-muted-foreground/40 size-4 rounded-full border" />}
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function RawJson({ item }: { item: StudioItem }) {
  const text = JSON.stringify(item.spec, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-muted-foreground font-mono text-xs">
          ```{item.kind} · {text.length.toLocaleString()} characters
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void navigator.clipboard.writeText(`\`\`\`${item.kind}\n${text}\n\`\`\``);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy as markdown"}
        </Button>
      </div>
      <pre className="bg-muted/30 max-h-[640px] overflow-auto p-4 font-mono text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

function SourcePanel({ item }: { item: StudioItem }) {
  const [open, setOpen] = useState(false);
  const SourceIcon = SOURCE_ICON[item.sourceType];
  const href = item.sourceType === "url" ? item.sourceRef : item.sourceType === "item" && item.sourceRef ? RESOURCE_PATH.page(item.sourceRef) : null;
  return (
    <section className="bg-card mt-6 rounded-2xl border shadow-xs">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Source</p>
        <span className="text-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <SourceIcon className="text-muted-foreground size-4 shrink-0" />
          {href ? (
            <a href={href} target={item.sourceType === "url" ? "_blank" : undefined} rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline">
              <span className="truncate">{item.sourceLabel}</span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </a>
          ) : (
            <span className="truncate">{item.sourceLabel}</span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-sm">
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
          {open ? "Hide" : "Show"} text ({item.sourceChars.toLocaleString()} characters)
        </button>
      </div>
      {open ? <pre className="bg-muted/30 max-h-96 overflow-auto border-t p-5 font-sans text-sm leading-relaxed whitespace-pre-wrap">{item.sourceText}</pre> : null}
    </section>
  );
}

function ShareDialog({ item, open, onOpenChange, onChange }: { item: StudioItem; open: boolean; onOpenChange: (o: boolean) => void; onChange: (item: StudioItem) => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/s/${item.id}` : `${window.location.origin}/s/${item.id}`;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      onChange(await studioApi.publish(item.id, on));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{item.title}”</DialogTitle>
          <DialogDescription>Anyone with the link can view and use it. The source text stays private.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <span>
            <span className="text-foreground-strong block text-sm font-semibold">Anyone with the link</span>
            <span className="text-muted-foreground block text-xs">{item.published ? "On: the link works for everyone" : "Off: only you can open it"}</span>
          </span>
          <Switch checked={item.published} disabled={busy} onCheckedChange={(on) => void toggle(on)} aria-label="Share by link" />
        </label>
        {item.published ? (
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="font-mono text-xs" />
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Open the shared page">
              <a href={url} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddToNoteDialog({ item, open, onOpenChange }: { item: StudioItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<SourceCandidate[] | null>(null);
  const [picked, setPicked] = useState<SourceCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || mode !== "existing") return;
    let live = true;
    const t = setTimeout(() => {
      studioApi
        .sources(item.workspaceId, q.trim())
        .then((r) => live && setNotes(r.filter((x) => x.kind === "note")))
        .catch(() => live && setNotes([]));
    }, q ? 220 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, mode, q, item.workspaceId]);

  const submit = async () => {
    setBusy(true);
    try {
      const note = await studioApi.addToNote(item.id, mode === "existing" && picked ? { noteId: picked.id } : { workspaceId: item.workspaceId });
      onOpenChange(false);
      toast.success(mode === "existing" ? `Added to “${note.title}”` : `Made the note “${note.title}”`, {
        action: { label: "Open", onClick: () => router.push(RESOURCE_PATH.page(note.id)) },
      });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to a note</DialogTitle>
          <DialogDescription>It goes in as a live {STUDIO_KIND_LABEL[item.kind].toLowerCase()} block you can keep editing.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(
            [
              ["new", "New note", `Titled “${item.title}”`],
              ["existing", "Existing note", "Added at the end"],
            ] as const
          ).map(([m, label, hint]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded-xl border p-3 text-left", mode === m ? "border-foreground-strong ring-foreground-strong bg-muted/50 ring-1" : "hover:bg-muted/40")}
            >
              <span className="text-foreground-strong block text-sm font-semibold">{label}</span>
              <span className="text-muted-foreground block truncate text-xs">{hint}</span>
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <div className="rounded-xl border">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="h-10 w-full border-b bg-transparent px-3 text-sm outline-none" autoFocus />
            <ul className="max-h-56 overflow-y-auto p-1">
              {notes === null ? (
                <li className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </li>
              ) : notes.length === 0 ? (
                <li className="text-muted-foreground px-3 py-3 text-sm">No notes found.</li>
              ) : (
                notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(n)}
                      className={cn("flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm", picked?.id === n.id ? "bg-muted" : "hover:bg-muted/60")}
                    >
                      <span className="truncate">{n.title || "Untitled"}</span>
                      {picked?.id === n.id ? <Check className="size-4 shrink-0" /> : <span className="text-muted-foreground shrink-0 text-xs">{since(n.updatedAt)}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || (mode === "existing" && !picked)} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "new" ? "Make note" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
