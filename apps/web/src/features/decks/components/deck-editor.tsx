"use client";

import "@octonote/slides/styles.css";
import "../slides.css";
import {
  addSlide,
  duplicateSlide,
  enterPresentationFullscreen,
  moveSlide,
  Presenter,
  removeSlide,
  SlideStage,
  SlideView,
  toDeckDocument,
  updateSlide,
  visibleDeckSlides,
  type DeckDocument,
  type DeckSlide,
  type NoteBlock,
  type SlideLayout,
} from "@octonote/slides";
import { Code2, FileDown, MoreHorizontal, NotebookText, Play, Presentation } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clientApi } from "@/lib/api/client-fetch";
import { Textarea } from "@/components/ui/textarea";
import { appCanvasResolver } from "@/features/notes/blocks/app-canvas-resolver";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { NoteWorkspaceContext } from "@/features/notes/blocks/interactive-block";
import { can, PublishedViaBadge, ShareDialog, type AccessRole } from "@/features/sharing";
import { updateDeckClientApi } from "../api/decks-client-api";
import { useSlideRenderers } from "../lib/renderers";
import type { Deck } from "../types";
import { EditableSlideBlocks } from "./slide-blocks";
import { SlideInspector } from "./slide-inspector";
import { SlideStrip } from "./slide-strip";

const SAVE_DEBOUNCE_MS = 1000;

export interface DeckEditorProps {
  deck: Deck;
  myRole: AccessRole;
  leading?: React.ReactNode;
}

/**
 * The presentation editor: slides down the left, the slide on the stage
 * (edited in place with the note editor), presenter notes under it, and the
 * slide's layout, builds and transition on the right.
 */
export function DeckEditor({ deck: initial, myRole, leading }: DeckEditorProps) {
  const editable = can.edit(myRole);
  const [deck, setDeck] = useState<DeckDocument>(() => toDeckDocument(initial.document));
  const [title, setTitle] = useState(initial.title);
  const [selected, setSelected] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [presenting, setPresenting] = useState<number | null>(null);
  const slide = deck.slides[Math.min(selected, deck.slides.length - 1)]!;
  const readRenderers = useSlideRenderers(deck);

  // Saves the whole deck a moment after the last change; one save at a time, the latest wins.
  const pending = useRef<DeckDocument | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const document = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState("saving");
    try {
      await updateDeckClientApi(initial.id, { document });
      setSaveState(pending.current ? "saving" : "saved");
    } catch (err) {
      console.error("Presentation save failed", err);
      // Keep the unsaved version (unless a newer one is waiting) and try again on the next change.
      pending.current ??= document;
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Couldn't save the presentation.");
    } finally {
      inFlight.current = false;
      if (pending.current) void flush();
    }
  }, [initial.id]);
  const change = useCallback(
    (update: (d: DeckDocument) => DeckDocument) => {
      setDeck((d) => {
        const next = update(d);
        pending.current = next;
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );
  // Leaving with changes not yet sent: send them now, and warn if the browser closes first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  const patchSlide = (patch: Partial<Omit<DeckSlide, "id">>) => change((d) => updateSlide(d, slide.id, patch));

  async function rename(next: string) {
    const prev = title;
    setTitle(next);
    try {
      await updateDeckClientApi(initial.id, { title: next });
    } catch (err) {
      setTitle(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't rename.");
    }
  }

  /** The iframe snippet for a published deck; says how to publish when it isn't. */
  async function copyEmbed() {
    try {
      const state = await clientApi.get<{ published: boolean; publicUrl: string | null; publishedVia: { kind: string; id: string } | null }>(`/deck/${initial.id}/publish`);
      // publicUrl is the deck's own page, or its notebook's when it's published through the notebook.
      const slug = state.publicUrl ? new URL(state.publicUrl).pathname.split("/")[2] : null;
      if (!state.published || !slug) {
        toast.message("Publish the presentation first (Share → Publish to web), then copy the embed code.");
        return;
      }
      const path = state.publishedVia ? `/embed/${slug}/${initial.id}` : `/embed/${slug}`;
      const code = `<iframe src="${window.location.origin}${path}" width="960" height="600" style="border:0;max-width:100%" allow="fullscreen" title="${title.replace(/"/g, "&quot;")}"></iframe>`;
      await navigator.clipboard.writeText(code);
      toast.success("Embed code copied. Paste it into any page.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't copy the embed code.");
    }
  }

  function present(fromSelected: boolean) {
    const visible = visibleDeckSlides(deck);
    if (!visible.length) {
      toast.message("Every slide is set to be skipped. Show one to present.");
      return;
    }
    const at = fromSelected ? Math.max(0, visible.findIndex((s) => s.id === slide.id)) : 0;
    enterPresentationFullscreen();
    setPresenting(at);
  }

  // The selected slide, edited in place. Each region is its own editor, rebuilt when the slide changes.
  const editRenderers = useMemo(
    () => ({
      ...readRenderers,
      renderBlocks: (blocks: NoteBlock[], ctx: { slide: DeckSlide; region: "main" | "side" }) => (
        <EditableSlideBlocks
          key={`${ctx.slide.id}:${ctx.region}`}
          deckId={initial.id}
          workspaceId={initial.workspaceId}
          blocks={blocks}
          onChange={(next) => change((d) => updateSlide(d, ctx.slide.id, { [ctx.region]: next }))}
        />
      ),
    }),
    [readRenderers, initial.id, initial.workspaceId, change],
  );

  return (
    <CanvasReferenceContext.Provider value={appCanvasResolver}>
      <NoteWorkspaceContext.Provider value={initial.workspaceId}>
        <div className="flex h-full flex-col">
          <FocusHeader
            leading={leading}
            icon={Presentation}
            title={
              <>
                {editable ? (
                  <EditableTitle value={title} onSave={rename} placeholder="Untitled presentation" />
                ) : (
                  <span className="truncate text-sm font-medium">{title || "Untitled presentation"}</span>
                )}
                {editable ? null : <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-2xs">View only</span>}
              </>
            }
          >
            <SaveIndicator state={saveState} />
            <PublishedViaBadge kind="deck" id={initial.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/print/d/${initial.id}`} target="_blank" rel="noopener">
                    <FileDown className="size-4" /> Save as PDF
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/print/d/${initial.id}?notes=1`} target="_blank" rel="noopener">
                    <NotebookText className="size-4" /> PDF with presenter notes
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void copyEmbed()}>
                  <Code2 className="size-4" /> Copy embed code
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ShareDialog kind="deck" id={initial.id} title={title} myRole={myRole} initialLinkAccess={initial.linkAccess} initialLinkRole={initial.linkRole} />
            <Button size="sm" className="gap-1.5" onClick={() => present(false)} title="Present from the start">
              <Play className="size-3.5" /> Present
            </Button>
          </FocusHeader>
          <div className="flex min-h-0 flex-1">
            <SlideStrip
              deck={deck}
              selected={selected}
              editable={editable}
              onSelect={setSelected}
              onAdd={(layout: SlideLayout) =>
                change((d) => {
                  const r = addSlide(d, selected, layout);
                  setSelected(r.index);
                  return r.deck;
                })
              }
              onDuplicate={(i) =>
                change((d) => {
                  const r = duplicateSlide(d, i);
                  setSelected(r.index);
                  return r.deck;
                })
              }
              onRemove={(i) =>
                change((d) => {
                  const r = removeSlide(d, i);
                  setSelected(r.index);
                  return r.deck;
                })
              }
              onToggleHidden={(i) => change((d) => updateSlide(d, d.slides[i]!.id, { hidden: d.slides[i]!.hidden ? undefined : true }))}
              onMove={(from, to) => change((d) => moveSlide(d, from, to))}
            />
            <main className="bg-muted/30 flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                <div className="h-full w-full">
                  <SlideStage aspect={deck.aspect} fit="contain" className={editable ? "oxd-edit" : ""}>
                    {/* Shrunk to fit like the audience sees it, so nothing hangs off the slide while editing. */}
                    <SlideView deck={deck} slide={slide} {...(editable ? editRenderers : readRenderers)} />
                  </SlideStage>
                </div>
              </div>
              <div className="bg-background flex items-start gap-3 border-t px-4 py-2">
                <label htmlFor="slide-notes" className="text-muted-foreground w-28 shrink-0 pt-1.5 text-2xs font-semibold tracking-wider uppercase">
                  Presenter notes
                  <span className="block font-normal tracking-normal normal-case">Only you see these</span>
                </label>
                <Textarea
                  key={slide.id}
                  id="slide-notes"
                  readOnly={!editable}
                  defaultValue={slide.notes}
                  placeholder="What to say on this slide…"
                  className="min-h-16 resize-y text-sm"
                  onChange={(e) => patchSlide({ notes: e.target.value })}
                />
                <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={() => present(true)} title="Present from this slide">
                  <Play className="size-3.5" /> From here
                </Button>
              </div>
            </main>
            {editable ? <SlideInspector deck={deck} slide={slide} onSlide={patchSlide} onDeck={(p) => change((d) => ({ ...d, ...p }))} /> : null}
          </div>
        </div>
        {presenting !== null ? (
          <Presenter
            deck={deck}
            start={{ slide: presenting, step: 0 }}
            onExit={() => setPresenting(null)}
            renderNotes={(notes) => <div className="whitespace-pre-wrap">{notes}</div>}
            {...readRenderers}
          />
        ) : null}
      </NoteWorkspaceContext.Provider>
    </CanvasReferenceContext.Provider>
  );
}
