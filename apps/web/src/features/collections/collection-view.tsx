"use client";

import "@octonote/widgets/styles.css";
import { markdownToBlocks } from "@octonote/compose";
import { removeUnits } from "@octonote/shared";
import { WidgetRenderer, WidgetsProvider } from "@octonote/widgets";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  addClip,
  APP_LABELS,
  composeDraft,
  deleteClip,
  deleteCollection,
  editClip,
  getCollection,
  MODES,
  renameCollection,
  reorderClips,
  saveDraft,
  type Clip,
  type ClipApp,
  type Collection,
  type Draft,
  type Mode,
} from "./api";

/** Markdown shown with the widgets library's safe renderer (no HTML). */
function Markdown({ text, dark }: { text: string; dark: boolean }) {
  const spec = useMemo(
    () => ({
      schemaVersion: "1.0",
      type: "document",
      id: "md",
      blocks: markdownToBlocks(text),
    }),
    [text],
  );
  return (
    <WidgetsProvider theme={dark ? "dark" : "light"}>
      <WidgetRenderer spec={spec} />
    </WidgetsProvider>
  );
}

const SOURCE_APPS: ClipApp[] = ["chatgpt", "claude", "gemini", "web", "other"];

export function CollectionView({ id }: { id: string }) {
  const router = useRouter();
  const dark = useIsDark();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  // Kept here so closing the panel doesn't lose a draft.
  const compose = useCompose();

  useEffect(() => {
    getCollection(id)
      .then(setCollection)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error)
    return <p className="text-muted-foreground p-8 text-sm">{error}</p>;
  if (!collection)
    return (
      <Loader2 className="text-muted-foreground m-8 size-5 animate-spin" />
    );

  const setClips = (clips: Clip[]) => setCollection({ ...collection, clips });
  const move = async (index: number, by: number) => {
    const ids = collection.clips.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    setClips(ids.map((cid) => collection.clips.find((c) => c.id === cid)!));
    await reorderClips(id, ids).catch(() => toast.error("Couldn't reorder."));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <Link
        href="/workspace/collections"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Collections
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <EditableName
          collection={collection}
          onRenamed={(name) => setCollection({ ...collection, name })}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={!collection.clips.length}
            onClick={() => setCreating(true)}
          >
            <Sparkles className="size-4" />
            {compose.draft ? "Open draft" : "Create from clips"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete collection"
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {collection.clips.length
          ? `${collection.clips.length} ${collection.clips.length === 1 ? "clip" : "clips"}. Make a summary, report, comparison, flashcards and more from them, with every sentence cited.`
          : "Clip from ChatGPT, Claude or Gemini with the Octonote Clipper extension, or paste below."}
      </p>

      <div className="mt-6">
        <section aria-label="Clips" className="min-w-0 space-y-4">
          <AddClip
            collectionId={id}
            onAdded={(clip) => setClips([...collection.clips, clip])}
          />
          {collection.clips.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              Paste the parts of an AI answer you want to keep. Each clip gets a
              number, which is how the note cites it.
            </p>
          ) : (
            <ol className="space-y-3">
              {collection.clips.map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  number={i + 1}
                  dark={dark}
                  first={i === 0}
                  last={i === collection.clips.length - 1}
                  onMove={(by) => void move(i, by)}
                  onChange={(next) =>
                    setClips(
                      collection.clips.map((c) =>
                        c.id === next.id ? next : c,
                      ),
                    )
                  }
                  onDelete={async () => {
                    await deleteClip(clip.id).catch(() =>
                      toast.error("Couldn't delete the clip."),
                    );
                    setClips(collection.clips.filter((c) => c.id !== clip.id));
                  }}
                />
              ))}
            </ol>
          )}
        </section>
      </div>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="text-foreground-strong flex items-center gap-2 text-lg">
              <Sparkles className="size-4" /> Create from these clips
            </SheetTitle>
            <SheetDescription>
              Written only from your {collection.clips.length}{" "}
              {collection.clips.length === 1 ? "clip" : "clips"}, with every
              sentence cited and checked.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-5">
            <Compose collection={collection} dark={dark} state={compose} />
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${collection.name}"?`}
        description="Its clips are deleted too. Notes you made from it stay."
        actionLabel="Delete collection"
        onConfirm={async () => {
          await deleteCollection(id);
          router.push("/workspace/collections");
        }}
      />
    </div>
  );
}

function EditableName({
  collection,
  onRenamed,
}: {
  collection: Collection;
  onRenamed: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  if (!editing)
    return (
      <button
        type="button"
        className="group text-foreground-strong flex min-w-0 items-center gap-2 text-left text-2xl font-bold"
        onClick={() => setEditing(true)}
      >
        <span className="truncate">{collection.name}</span>
        <Pencil
          className="text-muted-foreground size-4 opacity-0 group-hover:opacity-100"
          aria-label="Rename"
        />
      </button>
    );
  const save = async () => {
    setEditing(false);
    if (name.trim() && name !== collection.name) {
      await renameCollection(collection.id, name).catch(() =>
        toast.error("Couldn't rename."),
      );
      onRenamed(name.trim());
    }
  };
  return (
    <Input
      autoFocus
      value={name}
      aria-label="Collection name"
      className="max-w-md text-xl font-bold"
      onChange={(e) => setName(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function AddClip({
  collectionId,
  onAdded,
}: {
  collectionId: string;
  onAdded: (clip: Clip) => void;
}) {
  const [content, setContent] = useState("");
  const [app, setApp] = useState<ClipApp>("chatgpt");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      onAdded(
        await addClip(collectionId, content, {
          app,
          ...(url.trim() ? { url: url.trim() } : {}),
        }),
      );
      setContent("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="bg-card space-y-2 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void add();
          }
        }}
        rows={4}
        placeholder="Paste a part of an answer you want to keep…"
        aria-label="Clip text"
        className="bg-background focus-visible:ring-ring w-full resize-y rounded-md border p-2 text-sm outline-none focus-visible:ring-2"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">From</span>
        {SOURCE_APPS.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={app === a}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              app === a
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setApp(a)}
          >
            {APP_LABELS[a]}
          </button>
        ))}
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link to the chat (optional)"
          aria-label="Link to the chat"
          className="h-8 min-w-40 flex-1 text-xs"
        />
        <Button type="submit" size="sm" disabled={busy || !content.trim()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add clip
        </Button>
      </div>
    </form>
  );
}

function ClipCard(props: {
  clip: Clip;
  number: number;
  dark: boolean;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  onChange: (clip: Clip) => void;
  onDelete: () => void;
}) {
  const { clip, number } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.content);
  return (
    <li className="bg-card rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span
          className="bg-muted text-foreground-strong rounded px-1.5 font-semibold"
          title="Cited as this number"
        >
          [{number}]
        </span>
        <span className="text-muted-foreground">
          {APP_LABELS[clip.source.app]}
        </span>
        {clip.source.url ? (
          <a
            href={clip.source.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
          >
            chat <ExternalLink className="size-3" />
          </a>
        ) : null}
        <span className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Move clip ${number} up`}
            disabled={props.first}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Move clip ${number} down`}
            disabled={props.last}
            onClick={() => props.onMove(1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Edit clip ${number}`}
            onClick={() => setEditing((e) => !e)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Delete clip ${number}`}
            onClick={props.onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </span>
      </div>
      <div className="p-3 text-sm">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              aria-label={`Clip ${number} text`}
              className="bg-background w-full rounded-md border p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (setText(clip.content), setEditing(false))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    props.onChange(await editClip(clip.id, text));
                    setEditing(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <Markdown text={clip.content} dark={props.dark} />
        )}
      </div>
    </li>
  );
}

/** Pick what to make, write it from the clips only, review what the check flagged, save it as a note. */
/** What's being made from the clips: kept by the page, so it outlives the panel it's shown in. */
function useCompose() {
  const [mode, setMode] = useState<Mode>("summary");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState("");
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  return {
    mode,
    setMode,
    instructions,
    setInstructions,
    busy,
    setBusy,
    draft,
    setDraft,
    title,
    setTitle,
    removed,
    setRemoved,
    kept,
    setKept,
    saved,
    setSaved,
    saving,
    setSaving,
  };
}

function Compose({
  collection,
  dark,
  state,
}: {
  collection: Collection;
  dark: boolean;
  state: ReturnType<typeof useCompose>;
}) {
  const {
    mode,
    setMode,
    instructions,
    setInstructions,
    busy,
    setBusy,
    draft,
    setDraft,
    title,
    setTitle,
    removed,
    setRemoved,
    kept,
    setKept,
    saved,
    setSaved,
    saving,
    setSaving,
  } = state;

  const body = useMemo(
    () =>
      draft
        ? removeUnits(
            draft.body,
            draft.units.filter((u) => removed.has(u.id)),
          )
        : "",
    [draft, removed],
  );
  const live = draft?.units.filter((u) => !removed.has(u.id)) ?? [];
  const backed = live.filter((u) => u.status === "ok" || kept.has(u.id)).length;
  const open = live.filter((u) => u.status === "flagged" && !kept.has(u.id));
  // Conclusions reasoned from the clips (the point of a memo or brief): shown, not flagged.
  const inferences = live.filter(
    (u) => u.verdict === "inference" && u.status === "ok",
  );

  const create = async () => {
    setBusy(true);
    setSaved(null);
    try {
      const d = await composeDraft(collection.id, mode, instructions);
      setDraft(d);
      setTitle(d.title);
      setRemoved(new Set());
      setKept(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      setSaved(
        await saveDraft(collection.id, {
          title,
          body,
          sources: draft.sources,
          mode: draft.mode,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="What to make"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              mode === m.id
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        placeholder={
          mode === "custom"
            ? "Describe what to make, e.g. a decision memo for my manager"
            : "Anything else? e.g. for beginners, under 300 words (optional)"
        }
        aria-label="Instructions"
        className="bg-background mt-3 w-full resize-y rounded-md border p-2 text-sm"
      />
      <Button
        className="mt-2 w-full"
        disabled={
          busy ||
          !collection.clips.length ||
          (mode === "custom" && !instructions.trim())
        }
        onClick={() => void create()}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {busy
          ? "Writing, then checking every sentence…"
          : draft
            ? "Write again"
            : "Create"}
      </Button>

      {draft ? (
        <div className="mt-5 space-y-4 border-t pt-4">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              open.length
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {open.length ? (
              <AlertTriangle className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
            {backed} of {live.length} statements are backed by your clips
            {draft.checked
              ? ""
              : " (the AI check didn't run; numbers and citations were still checked)"}
          </p>
          {inferences.length ? (
            <details className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-2 text-sm">
              <summary className="cursor-pointer font-medium">
                {inferences.length}{" "}
                {inferences.length === 1
                  ? "is a conclusion"
                  : "are conclusions"}{" "}
                drawn from your clips
              </summary>
              <p className="text-muted-foreground mt-1 text-xs">
                Recommendations and judgements that reason from the clips
                without adding new facts.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {inferences.map((u) => (
                  <li key={u.id}>{u.text}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {open.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Flagged</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setRemoved(new Set([...removed, ...open.map((u) => u.id)]))
                  }
                >
                  Remove all flagged
                </Button>
              </div>
              <ul className="space-y-2">
                {open.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-sm"
                  >
                    <p>{u.text}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {u.reasons.join(" · ")}
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setRemoved(new Set([...removed, u.id]))}
                      >
                        Remove
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setKept(new Set([...kept, u.id]))}
                      >
                        Keep
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Note title"
              className="font-semibold"
            />
            <div className="mt-2 max-h-[28rem] overflow-y-auto rounded-lg border p-3 text-sm">
              <Markdown text={`${body}\n\n${draft.sources}`} dark={dark} />
            </div>
          </div>
          {saved ? (
            <Button asChild className="w-full" variant="secondary">
              <Link href={`/n/${saved.id}`}>
                <FileText className="size-4" /> Open "{saved.title}"
              </Link>
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={saving || !title.trim() || !body.trim()}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Save as note{open.length ? ` (${open.length} flagged kept)` : ""}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(root.classList.contains("dark")),
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
