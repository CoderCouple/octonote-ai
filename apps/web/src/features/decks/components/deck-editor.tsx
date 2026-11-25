"use client";

import "@octonote/slides/styles.css";
import "../slides.css";
import {
  addAnimation,
  addElements,
  addSlide,
  alignElements,
  animateParagraphs,
  copyForClipboard,
  distributeElements,
  duplicateElements,
  duplicateSlide,
  ElementBody,
  enterPresentationFullscreen,
  groupElements,
  moveAnimation,
  moveElements,
  moveSlide,
  pasteFromClipboard,
  Presenter,
  pruneAnimations,
  removeAnimation,
  removeElements,
  removeSlide,
  reorderElements,
  SLIDE_SIZE,
  slideSteps,
  slideTimeline,
  stepDuration,
  toDeckDocument,
  ungroupElements,
  updateAnimation,
  updateElements,
  updateSlide,
  visibleDeckSlides,
  type DeckDocument,
  type DeckSlide,
  type NoteBlock,
  type SlideAnimation,
  type SlideElement,
  type SlideTemplate,
} from "@octonote/slides";
import { Code2, FileDown, MoreHorizontal, NotebookText, Play, Presentation, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { appCanvasResolver } from "@/features/notes/blocks/app-canvas-resolver";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { NoteWorkspaceContext } from "@/features/notes/blocks/interactive-block";
import { can, PublishedViaBadge, ShareDialog, type AccessRole } from "@/features/sharing";
import { clientApi } from "@/lib/api/client-fetch";
import { updateDeckClientApi } from "../api/decks-client-api";
import { useHistory } from "../lib/history";
import { useSlideRenderers } from "../lib/renderers";
import type { Deck } from "../types";
import { EditorStage } from "./editor-stage";
import { InsertBar } from "./insert-bar";
import { Inspector, type InspectorActions, type InspectorTab } from "./inspector";
import { EditableSlideBlocks } from "./slide-blocks";
import { SlideStrip } from "./slide-strip";

const SAVE_DEBOUNCE_MS = 1000;
/** Clipboard format for objects copied between slides (and decks). */
const CLIP_TYPE = "application/x-octonote-slides";
const CLIP_PREFIX = "octonote-slides:";

export interface DeckEditorProps {
  deck: Deck;
  myRole: AccessRole;
  leading?: React.ReactNode;
}

/** Typing into a field or an object being edited: keys belong to it. */
const isTyping = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='slider'], [role='textbox'], [role='menu'], [role='listbox']");

/**
 * The presentation editor, PowerPoint-style: slides down the left, the slide
 * in the middle with objects you select, drag, resize and rotate (double-click
 * to edit), an insert bar above it, presenter notes below, and the Arrange,
 * Style, Animate and Slide panels on the right. Every change is one undo
 * step; the deck saves itself a moment after the last change.
 */
export function DeckEditor({ deck: initial, myRole, leading }: DeckEditorProps) {
  const editable = can.edit(myRole);
  const history = useHistory<DeckDocument>(toDeckDocument(initial.document));
  const deck = history.value;
  const [title, setTitle] = useState(initial.title);
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>("arrange");
  const [previewStep, setPreviewStep] = useState<number | undefined>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [presenting, setPresenting] = useState<number | null>(null);
  const slide = deck.slides[Math.min(index, deck.slides.length - 1)]!;
  const renderers = useSlideRenderers(deck);
  const picked = useMemo(() => slide.elements.filter((e) => selection.includes(e.id)), [slide, selection]);

  // Moving to another slide (or undoing past an object) drops what no longer exists.
  useEffect(() => {
    setSelection((sel) => sel.filter((id) => slide.elements.some((e) => e.id === id)));
    setEditing((id) => (id && slide.elements.some((e) => e.id === id) ? id : null));
  }, [slide]);

  // ---- saving: the whole deck, a moment after the last change; one save at a time ----
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
      pending.current ??= document;
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Couldn't save the presentation.");
    } finally {
      inFlight.current = false;
      if (pending.current) void flush();
    }
  }, [initial.id]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!editable) return;
    pending.current = deck;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [deck, editable, flush]);
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

  // ---- changes ----
  const changeSlide = useCallback(
    (fn: (s: DeckSlide) => DeckSlide, merge?: string) => history.change((d) => updateSlide(d, d.slides[Math.min(index, d.slides.length - 1)]!.id, fn), merge ? { merge } : {}),
    [history, index],
  );
  const insert = (inserted: SlideElement) => {
    // A spot already taken (the last insert) gets the next one just off it, as PowerPoint does.
    let element = inserted;
    while (slide.elements.some((e) => e.x === element.x && e.y === element.y)) element = { ...element, x: element.x + 24, y: element.y + 24 };
    changeSlide((s) => addElements(s, [element]));
    setSelection([element.id]);
    // A new text box is ready to type into.
    if (element.kind === "text") setEditing(element.id);
  };
  const removeSelected = () => {
    if (!selection.length) return;
    changeSlide((s) => removeElements(s, selection));
    setSelection([]);
    setEditing(null);
  };
  const duplicateSelected = () => {
    if (!selection.length) return;
    let ids: string[] = [];
    changeSlide((s) => {
      const r = duplicateElements(s, selection);
      ids = r.ids;
      return r.slide;
    });
    setSelection(ids);
  };

  const stage = SLIDE_SIZE[deck.aspect];
  const act: InspectorActions = {
    patchElements: (ids, change, force) => changeSlide((s) => updateElements(s, ids, change, force), `patch:${ids.join(",")}`),
    align: (edge) => changeSlide((s) => alignElements(s, selection, edge, stage)),
    distribute: (axis) => changeSlide((s) => distributeElements(s, selection, axis)),
    layer: (move) => changeSlide((s) => reorderElements(s, selection, move)),
    group: () => changeSlide((s) => groupElements(s, selection)),
    ungroup: () => changeSlide((s) => ungroupElements(s, selection)),
    duplicate: duplicateSelected,
    remove: removeSelected,
    addAnimation: (type, effect) => {
      const el = picked[0];
      if (el) changeSlide((s) => addAnimation(s, el.id, type, effect).slide);
    },
    animateParagraphs: (elementId) => changeSlide((s) => animateParagraphs(s, elementId)),
    updateAnimation: (id, patch: Partial<SlideAnimation>) => changeSlide((s) => updateAnimation(s, id, patch), `anim:${id}`),
    removeAnimation: (id) => changeSlide((s) => removeAnimation(s, id)),
    moveAnimation: (id, to) => changeSlide((s) => moveAnimation(s, id, to)),
    selectElement: (id) => setSelection([id]),
    preview: () => playPreview(),
    patchSlide: (patch) => changeSlide((s) => ({ ...s, ...patch }), "slide-settings"),
    patchDeck: (patch) => history.change((d) => ({ ...d, ...patch })),
  };

  // ---- animation preview: the slide's clicks, played in place ----
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function playPreview() {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setEditing(null);
    const steps = slideTimeline(slide);
    let at = 0;
    const show = () => {
      setPreviewStep(at);
      const wait = stepDuration(steps[at] ?? []) + 700;
      previewTimer.current = setTimeout(() => {
        at += 1;
        if (at <= slideSteps(slide)) show();
        else previewTimer.current = setTimeout(() => setPreviewStep(undefined), 300);
      }, wait);
    };
    show();
  }
  useEffect(() => () => void (previewTimer.current && clearTimeout(previewTimer.current)), []);
  // Any edit ends a preview.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewStep(undefined);
  }, [deck, index]);

  // ---- keyboard: PowerPoint's shortcuts ----
  const keyState = useRef({ selection, editing, slide, editable });
  keyState.current = { selection, editing, slide, editable };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selection: sel, editing: ed, slide: s, editable: canEdit } = keyState.current;
      const mod = e.metaKey || e.ctrlKey;
      if (!canEdit || presenting !== null) return;
      // Undo/redo work everywhere except inside a text field (it has its own).
      if (mod && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !isTyping(e.target)) {
        e.preventDefault();
        history.redo();
        return;
      }
      if (ed || isTyping(e.target)) {
        if (e.key === "Escape" && ed) {
          e.preventDefault();
          setEditing(null);
        }
        return;
      }
      const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (nudge && sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        changeSlide((x) => moveElements(x, sel, nudge[0]! * step, nudge[1]! * step), "nudge");
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        changeSlide((x) => removeElements(x, sel));
        setSelection([]);
      } else if (mod && e.key.toLowerCase() === "d" && sel.length) {
        e.preventDefault();
        let ids: string[] = [];
        changeSlide((x) => {
          const r = duplicateElements(x, sel);
          ids = r.ids;
          return r.slide;
        });
        setSelection(ids);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(s.elements.filter((x) => !x.lock).map((x) => x.id));
      } else if (mod && e.key.toLowerCase() === "g" && sel.length) {
        e.preventDefault();
        changeSlide((x) => (e.shiftKey ? ungroupElements(x, sel) : groupElements(x, sel)));
      } else if ((e.key === "]" || e.key === "[") && sel.length) {
        e.preventDefault();
        changeSlide((x) => reorderElements(x, sel, e.key === "]" ? (mod ? "front" : "forward") : mod ? "back" : "backward"));
      } else if (e.key === "Enter" && sel.length === 1) {
        const el = s.elements.find((x) => x.id === sel[0]);
        if (el && (el.kind === "text" || el.kind === "block") && !el.lock) {
          e.preventDefault();
          setEditing(el.id);
        }
      } else if (e.key === "Escape" && sel.length) {
        setSelection([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, changeSlide, presenting]);

  // ---- clipboard: objects copy and paste between slides and decks ----
  useEffect(() => {
    if (!editable) return;
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const { selection: sel, editing: ed, slide: s } = keyState.current;
      if (ed || isTyping(e.target) || !sel.length || !e.clipboardData) return;
      const clip = JSON.stringify(copyForClipboard(s, sel));
      e.clipboardData.setData(CLIP_TYPE, clip);
      e.clipboardData.setData("text/plain", CLIP_PREFIX + clip);
      e.preventDefault();
      if (cut) {
        changeSlide((x) => removeElements(x, sel));
        setSelection([]);
      }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (keyState.current.editing || isTyping(e.target) || !e.clipboardData) return;
      const raw = e.clipboardData.getData(CLIP_TYPE) || e.clipboardData.getData("text/plain");
      const json = raw.startsWith(CLIP_PREFIX) ? raw.slice(CLIP_PREFIX.length) : e.clipboardData.getData(CLIP_TYPE) ? raw : null;
      if (!json) return;
      try {
        const clip = JSON.parse(json) as { elements: SlideElement[]; animations: SlideAnimation[] };
        if (!Array.isArray(clip.elements)) return;
        e.preventDefault();
        let ids: string[] = [];
        changeSlide((x) => {
          const r = pasteFromClipboard(x, { elements: clip.elements, animations: clip.animations ?? [] });
          ids = r.ids;
          return r.slide;
        });
        setSelection(ids);
      } catch {
        /* not ours */
      }
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", paste);
    };
  }, [editable, changeSlide]);

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
    setEditing(null);
    enterPresentationFullscreen();
    setPresenting(at);
  }

  /** An object being edited in place: the note editor, with the slide's padding and alignment. */
  const renderEditing = (el: SlideElement) =>
    "blocks" in el ? (
      <ElementBody element={el}>
        <EditableSlideBlocks
          key={el.id}
          deckId={initial.id}
          workspaceId={initial.workspaceId}
          blocks={el.blocks}
          autoFocus
          onChange={(blocks: NoteBlock[]) =>
            changeSlide((s) => pruneAnimations(updateElements(s, [el.id], (e) => ({ ...e, blocks }) as SlideElement)), `text:${el.id}`)
          }
        />
      </ElementBody>
    ) : null;

  return (
    <CanvasReferenceContext.Provider value={appCanvasResolver}>
      <NoteWorkspaceContext.Provider value={initial.workspaceId}>
        <div className="flex h-full flex-col">
          <FocusHeader
            leading={leading}
            icon={Presentation}
            title={
              <>
                {editable ? <EditableTitle value={title} onSave={rename} placeholder="Untitled presentation" /> : <span className="truncate text-sm font-medium">{title || "Untitled presentation"}</span>}
                {editable ? null : <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-2xs">View only</span>}
              </>
            }
          >
            <SaveIndicator state={saveState} />
            {editable ? (
              <>
                <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Undo" title="Undo (⌘Z)" disabled={!history.canUndo} onClick={() => history.undo()}>
                  <Undo2 className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!history.canRedo} onClick={() => history.redo()}>
                  <Redo2 className="size-4" />
                </Button>
              </>
            ) : null}
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
              selected={index}
              editable={editable}
              onSelect={(i) => {
                setIndex(i);
                setSelection([]);
                setEditing(null);
              }}
              onAdd={(template: SlideTemplate) => {
                const r = addSlide(deck, index, template);
                history.change(r.deck);
                setIndex(r.index);
              }}
              onDuplicate={(i) => {
                const r = duplicateSlide(deck, i);
                history.change(r.deck);
                setIndex(r.index);
              }}
              onRemove={(i) => {
                const r = removeSlide(deck, i);
                history.change(r.deck);
                setIndex(r.index);
              }}
              onToggleHidden={(i) => history.change((d) => updateSlide(d, d.slides[i]!.id, (s) => ({ ...s, hidden: s.hidden ? undefined : true })))}
              onMove={(from, to) => history.change((d) => moveSlide(d, from, to))}
            />
            <main className="bg-muted/30 flex min-w-0 flex-1 flex-col">
              {editable ? <InsertBar aspect={deck.aspect} deckId={initial.id} workspaceId={initial.workspaceId} onInsert={insert} /> : null}
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                {editable ? (
                  <EditorStage
                    deck={deck}
                    slide={slide}
                    selection={selection}
                    onSelect={(ids) => {
                      setSelection(ids);
                      if (ids.length && tab === "slide") setTab("arrange");
                    }}
                    editing={editing}
                    onEditing={setEditing}
                    onChange={(next) => changeSlide(() => next)}
                    renderers={renderers}
                    renderEditing={renderEditing}
                    previewStep={previewStep}
                  />
                ) : (
                  <EditorStage
                    deck={deck}
                    slide={slide}
                    selection={[]}
                    onSelect={() => {}}
                    editing={null}
                    onEditing={() => {}}
                    onChange={() => {}}
                    renderers={renderers}
                    renderEditing={() => null}
                  />
                )}
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
                  onChange={(e) => {
                    const notes = e.target.value;
                    changeSlide((s) => ({ ...s, notes }), `notes:${slide.id}`);
                  }}
                />
                <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={() => present(true)} title="Present from this slide">
                  <Play className="size-3.5" /> From here
                </Button>
              </div>
            </main>
            {editable ? <Inspector deck={deck} slide={slide} picked={picked} tab={tab} onTab={setTab} act={act} /> : null}
          </div>
        </div>
        {presenting !== null ? (
          <Presenter deck={deck} start={{ slide: presenting, step: 0 }} onExit={() => setPresenting(null)} renderNotes={(notes) => <div className="whitespace-pre-wrap">{notes}</div>} {...renderers} />
        ) : null}
      </NoteWorkspaceContext.Provider>
    </CanvasReferenceContext.Provider>
  );
}
