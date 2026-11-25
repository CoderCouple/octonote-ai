"use client";

import "@octonote/slides/styles.css";
import { deckFromNote, deckFromNotebook, deckFromProject, SlideOutline, type ConvertOptions, type DeckDocument, type SplitMode } from "@octonote/slides";
import { Loader2, Presentation, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { createDeckClientApi, createDeckFromSourceClientApi } from "../api/decks-client-api";
import { loadDeckSource, type DeckSourceRef, type LoadedSource } from "../lib/load-source";

/** What the API accepts; checked here too so a huge source fails with a clear message, not a 413. */
const MAX_BYTES = 8 * 1024 * 1024;

const SOURCE_NAME = { page: "note", project: "project", notebook: "notebook" } as const;

export interface MakePresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DeckSourceRef;
  workspaceId: string;
  /** The new presentation goes into this notebook (the source's own). */
  notebookId?: string | null;
}

function convert(loaded: LoadedSource, options: ConvertOptions): DeckDocument {
  if (loaded.kind === "page") return deckFromNote(loaded.note, options);
  if (loaded.kind === "project") return deckFromProject(loaded.project, options);
  return deckFromNotebook(loaded.notebook, options);
}

/**
 * Turns a note, project or notebook into a presentation. The original is
 * never changed: the deck is a copy that remembers where it came from. The
 * preview updates as the options change, before anything is made.
 */
export function MakePresentationDialog({ open, onOpenChange, source, workspaceId, notebookId }: MakePresentationDialogProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [split, setSplit] = useState<SplitMode>("heading");
  /** "ai": the server plans the slides with a model; no preview, uses the AI allowance. */
  const [design, setDesign] = useState<"rules" | "ai">("rules");
  const [textToNotes, setTextToNotes] = useState(true);
  const [onePerSlide, setOnePerSlide] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    loadDeckSource(source)
      .then((l) => !cancelled && setLoaded(l))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : `Couldn't read the ${SOURCE_NAME[source.kind]}.`));
    return () => {
      cancelled = true;
    };
  }, [open, source]);

  const deck = useMemo(() => (loaded ? convert(loaded, { split, textToNotes, onePerSlide }) : null), [loaded, split, textToNotes, onePerSlide]);

  async function designWithAi() {
    setCreating(true);
    try {
      const made = await createDeckFromSourceClientApi(workspaceId, {
        source: { kind: source.kind, id: source.id, split },
        design: "ai",
        ...(notebookId ? { notebookId } : {}),
      });
      onOpenChange(false);
      router.push(`/d/${made.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The AI couldn't design these slides.");
      setCreating(false);
    }
  }

  async function create() {
    if (design === "ai") return designWithAi();
    if (!deck) return;
    if (new Blob([JSON.stringify(deck)]).size > MAX_BYTES) {
      toast.error("This is too much for one presentation (over 8 MB). Try a single note, or split the notebook.");
      return;
    }
    setCreating(true);
    try {
      const made = await createDeckClientApi(workspaceId, {
        title: source.title || "Untitled presentation",
        document: deck,
        source: { kind: source.kind, id: source.id, split },
        ...(notebookId ? { notebookId } : {}),
      });
      onOpenChange(false);
      router.push(`/d/${made.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make the presentation.");
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="size-4" /> Make presentation
          </DialogTitle>
          <DialogDescription>
            From the {SOURCE_NAME[source.kind]} “{source.title || "Untitled"}”. It stays as it is; the presentation is a copy you can edit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-5 md:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-4 text-sm">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-muted-foreground mb-2 text-2xs font-semibold tracking-wider uppercase">New slide at each</legend>
              <RadioGroup value={design === "ai" ? "ai" : split} onValueChange={(v) => (v === "ai" ? setDesign("ai") : (setDesign("rules"), setSplit(v as SplitMode)))}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="split-heading" value="heading" className="mt-0.5" />
                  <Label htmlFor="split-heading" className="flex flex-col items-start gap-0.5 font-normal">
                    Heading
                    <span className="text-muted-foreground text-xs">Each H1 or H2 starts a slide.</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="split-divider" value="divider" className="mt-0.5" />
                  <Label htmlFor="split-divider" className="flex flex-col items-start gap-0.5 font-normal">
                    Divider (---)
                    <span className="text-muted-foreground text-xs">You decide exactly where slides break.</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="split-ai" value="ai" className="mt-0.5" />
                  <Label htmlFor="split-ai" className="flex flex-col items-start gap-0.5 font-normal">
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3.5" /> Let AI design it
                    </span>
                    <span className="text-muted-foreground text-xs">Short points on the slides, your words in the notes, your blocks kept. Uses AI allowance.</span>
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
            <div className={`flex items-start justify-between gap-3 ${design === "ai" ? "opacity-50" : ""}`}>
              <Label htmlFor="text-to-notes" className="flex flex-col items-start gap-0.5 font-normal">
                Paragraphs to presenter notes
                <span className="text-muted-foreground text-xs">Slides keep the points; you keep the script.</span>
              </Label>
              <Switch id="text-to-notes" checked={textToNotes} onCheckedChange={setTextToNotes} disabled={design === "ai"} />
            </div>
            <div className={`flex items-start justify-between gap-3 ${design === "ai" ? "opacity-50" : ""}`}>
              <Label htmlFor="one-per-slide" className="flex flex-col items-start gap-0.5 font-normal">
                Each block on its own slide
                <span className="text-muted-foreground text-xs">A quiz, app or video gets the room it needs.</span>
              </Label>
              <Switch id="one-per-slide" checked={onePerSlide} onCheckedChange={setOnePerSlide} disabled={design === "ai"} />
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase" aria-live="polite">
              {design === "ai" ? "What the AI will do" : deck ? `What you'll get · ${deck.slides.length} ${deck.slides.length === 1 ? "slide" : "slides"}` : "What you'll get"}
            </span>
            <div className="bg-muted/40 max-h-[52vh] min-h-48 overflow-y-auto rounded-lg border p-3">
              {design === "ai" ? (
                <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm">
                  {creating ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
                  <p className="max-w-sm">
                    {creating
                      ? "Designing your slides… this takes about half a minute."
                      : "The AI plans the slides: a title, sections, a few short points each, your quizzes, apps and videos on their own slides, and what to say in the presenter notes."}
                  </p>
                </div>
              ) : loadError ? (
                <p className="text-destructive text-sm">{loadError}</p>
              ) : !deck ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Reading the {SOURCE_NAME[source.kind]}…
                </p>
              ) : (
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {deck.slides.map((s, i) => (
                    <li key={s.id} className="flex flex-col gap-1">
                      <div className={`osl-theme-${deck.theme} relative aspect-video overflow-hidden rounded-md border bg-[var(--osl-bg)] text-[var(--osl-fg)]`}>
                        <SlideOutline slide={s} />
                      </div>
                      <span className="text-muted-foreground text-2xs tabular-nums">
                        {i + 1}
                        {s.notes ? " · has notes" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={create} disabled={(design === "rules" && !deck) || creating} className="gap-1.5">
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : design === "ai" ? <Sparkles className="size-3.5" /> : null}
            {design === "ai" ? "Design with AI" : deck ? `Make ${deck.slides.length} ${deck.slides.length === 1 ? "slide" : "slides"}` : "Make presentation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
