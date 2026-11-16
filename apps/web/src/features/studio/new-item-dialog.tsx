"use client";

import {
  STUDIO_KIND_HINT,
  STUDIO_KIND_LABEL,
  STUDIO_KINDS,
  STUDIO_LIMITS,
  type StudioKind,
  type StudioSource,
  type StudioSourceType,
} from "@octonote/shared";
import { Check, FileUp, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AI_SETTINGS_PATH, errorText, needsAiKey, studioApi, type SourceCandidate } from "./api";
import { KIND_ICON, SOURCE_ICON, since } from "./kinds";

const SOURCE_TABS: { type: StudioSourceType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "url", label: "Web page" },
  { type: "item", label: "Note" },
  { type: "pdf", label: "PDF" },
];

/** Pick a source and a format; the item is made in the background and opens straight away. */
export function NewItemDialog({
  workspaceId,
  open,
  onOpenChange,
  initialKind,
  initialItem,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: StudioKind;
  initialItem?: SourceCandidate;
}) {
  const router = useRouter();
  const [type, setType] = useState<StudioSourceType>(initialItem ? "item" : "text");
  const [kind, setKind] = useState<StudioKind>(initialKind ?? "infographic");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [item, setItem] = useState<SourceCandidate | null>(initialItem ?? null);
  const [pdf, setPdf] = useState<{ name: string; size: number; data: string } | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initialKind) setKind(initialKind);
    if (initialItem) {
      setType("item");
      setItem(initialItem);
    }
  }, [open, initialKind, initialItem]);

  const source: StudioSource | null =
    type === "text"
      ? text.trim().length >= STUDIO_LIMITS.minSourceChars
        ? { type, text }
        : null
      : type === "url"
        ? /^https?:\/\/\S+\.\S+/.test(url.trim())
          ? { type, url: url.trim() }
          : null
        : type === "item"
          ? item
            ? { type, id: item.id }
            : null
          : pdf
            ? { type, name: pdf.name, data: pdf.data }
            : null;

  const submit = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await studioApi.create({ workspaceId, kind, source, ...(title.trim() ? { title: title.trim() } : {}) });
      onOpenChange(false);
      setText("");
      setUrl("");
      setPdf(null);
      setTitle("");
      router.push(`/workspace/studio/${made.id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle className="text-xl">New in Studio</DialogTitle>
          <DialogDescription>Turn something you&apos;re reading into an infographic, mind map, flashcards, a quiz and more.</DialogDescription>
        </DialogHeader>

        <div className="space-y-7 px-6 py-6">
          <section>
            <StepLabel n={1}>Source</StepLabel>
            <div role="tablist" aria-label="Source" className="bg-muted mt-3 inline-flex gap-1 rounded-lg border p-1">
              {SOURCE_TABS.map((t) => {
                const Icon = SOURCE_ICON[t.type];
                return (
                  <button
                    key={t.type}
                    type="button"
                    role="tab"
                    aria-selected={type === t.type}
                    onClick={() => setType(t.type)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                      type === t.type ? "bg-card text-foreground-strong shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              {type === "text" ? (
                <div>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste an article, lecture notes, a transcript…"
                    className="min-h-40 resize-y"
                    autoFocus
                  />
                  <p className="text-muted-foreground mt-1.5 flex justify-between text-xs">
                    <span>{text.trim().length < STUDIO_LIMITS.minSourceChars ? `At least ${STUDIO_LIMITS.minSourceChars} characters` : " "}</span>
                    <span className="tabular-nums">
                      {text.length.toLocaleString()}
                      {text.length > STUDIO_LIMITS.sourceChars ? ` · the first ${STUDIO_LIMITS.sourceChars.toLocaleString()} are used` : ""}
                    </span>
                  </p>
                </div>
              ) : null}
              {type === "url" ? (
                <div>
                  <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://en.wikipedia.org/wiki/Photosynthesis" autoFocus />
                  <p className="text-muted-foreground mt-1.5 text-xs">The page&apos;s main text is read; menus, ads and comments are left out.</p>
                </div>
              ) : null}
              {type === "item" ? <ItemPicker workspaceId={workspaceId} value={item} onChange={setItem} /> : null}
              {type === "pdf" ? <PdfPicker value={pdf} onChange={setPdf} onError={setError} /> : null}
            </div>
          </section>

          <section>
            <StepLabel n={2}>Format</StepLabel>
            <div role="radiogroup" aria-label="Format" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STUDIO_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k)}
                    className={cn(
                      "relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      on ? "border-foreground-strong bg-muted/60 ring-foreground-strong ring-1" : "hover:bg-muted/40",
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", on ? "bg-foreground-strong text-background border-foreground-strong" : "bg-card")}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-foreground-strong block text-sm font-semibold">{STUDIO_KIND_LABEL[k]}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{STUDIO_KIND_HINT[k]}</span>
                    </span>
                    {on ? <Check className="text-foreground-strong absolute top-3 right-3 size-4" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <Label htmlFor="studio-title" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Title <span className="normal-case">(optional)</span>
            </Label>
            <Input id="studio-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={STUDIO_LIMITS.title} placeholder="The AI names it if you leave this empty" className="mt-2" />
          </section>

          {error ? (
            <p role="alert" className="border-destructive/40 text-destructive flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>{error}</span>
              {needsAiKey(error) ? (
                <a href={AI_SETTINGS_PATH} className="text-foreground font-medium underline underline-offset-4">
                  Open Settings → AI
                </a>
              ) : null}
            </p>
          ) : null}
        </div>

        <DialogFooter className="bg-muted/30 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!source || busy} className="min-w-32 gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? (type === "url" ? "Reading page…" : type === "pdf" ? "Reading PDF…" : "Starting…") : `Make ${STUDIO_KIND_LABEL[kind].toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="text-foreground-strong flex items-center gap-2 text-sm font-semibold">
      <span className="bg-foreground-strong text-background grid size-5 place-items-center rounded-full text-[11px] tabular-nums">{n}</span>
      {children}
    </h3>
  );
}

function ItemPicker({ workspaceId, value, onChange }: { workspaceId: string; value: SourceCandidate | null; onChange: (v: SourceCandidate | null) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SourceCandidate[] | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      studioApi
        .sources(workspaceId, q.trim())
        .then((r) => live && setItems(r))
        .catch(() => live && setItems([]));
    }, q ? 220 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [workspaceId, q]);

  if (value)
    return (
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <span className="bg-muted grid size-9 place-items-center rounded-lg border">
          <SOURCE_ICON.item className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground-strong block truncate text-sm font-semibold">{value.title || "Untitled"}</span>
          <span className="text-muted-foreground block text-xs capitalize">{value.kind}{value.notebook ? ` · ${value.notebook}` : ""}</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)} className="gap-1">
          <X className="size-3.5" /> Change
        </Button>
      </div>
    );

  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, canvases and projects" className="h-10 flex-1 bg-transparent text-sm outline-none" autoFocus />
      </div>
      <ul className="max-h-60 overflow-y-auto p-1" role="listbox" aria-label="Notes">
        {items === null ? (
          <li className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </li>
        ) : items.length === 0 ? (
          <li className="text-muted-foreground px-3 py-3 text-sm">{q ? "Nothing matches." : "No notes yet."}</li>
        ) : (
          items.map((it) => (
            <li key={it.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => onChange(it)} className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">{it.title || "Untitled"}</span>
                  <span className="text-muted-foreground block truncate text-xs capitalize">
                    {it.kind}
                    {it.notebook ? ` · ${it.notebook}` : ""} · {since(it.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PdfPicker({
  value,
  onChange,
  onError,
}: {
  value: { name: string; size: number; data: string } | null;
  onChange: (v: { name: string; size: number; data: string } | null) => void;
  onError: (message: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return onError("Choose a PDF file.");
    if (file.size > STUDIO_LIMITS.pdfBytes) return onError(`PDFs can be up to ${STUDIO_LIMITS.pdfBytes / 1024 / 1024} MB.`);
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result).split(",")[1] ?? "";
      onError(null);
      onChange({ name: file.name, size: file.size, data });
    };
    reader.onerror = () => toast.error("That file couldn't be read.");
    reader.readAsDataURL(file);
  };

  if (value)
    return (
      <div className="flex items-center gap-3 rounded-xl border p-3">
        <span className="bg-muted grid size-9 place-items-center rounded-lg border">
          <SOURCE_ICON.pdf className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground-strong block truncate text-sm font-semibold">{value.name}</span>
          <span className="text-muted-foreground block text-xs tabular-nums">{(value.size / 1024 / 1024).toFixed(value.size < 1024 * 1024 ? 2 : 1)} MB</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)} className="gap-1">
          <X className="size-3.5" /> Remove
        </Button>
      </div>
    );

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        take(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
        drag ? "border-foreground-strong bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <FileUp className="text-muted-foreground size-6" />
      <span className="text-foreground-strong text-sm font-semibold">Drop a PDF here, or click to choose one</span>
      <span className="text-muted-foreground text-xs">Up to {STUDIO_LIMITS.pdfBytes / 1024 / 1024} MB. Text PDFs only; scanned pages can&apos;t be read.</span>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => take(e.target.files?.[0])} />
    </button>
  );
}
