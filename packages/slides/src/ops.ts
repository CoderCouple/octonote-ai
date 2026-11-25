/**
 * Editing a deck: pure functions that return a new deck or slide, so the
 * editor gets undo for free and every rule (ids stay unique, locked objects
 * don't move, animations follow their objects) lives in one tested place.
 */
import { allBlockIds, copyBlocks, heading, paragraph, bullet } from "./blocks.js";
import { boundsOf, centerOf, type Box } from "./geometry.js";
import { newLegacySlide, type SlideLayout } from "./legacy.js";
import {
  animationId,
  ANIMATION_EFFECTS,
  elementId,
  slideId,
  type AnimationTrigger,
  type AnimationType,
  type DeckAspect,
  type DeckDocument,
  type DeckSlide,
  type SlideAnimation,
  type SlideElement,
} from "./model.js";
import { upgradeSlide } from "./upgrade.js";

const withSlides = (deck: DeckDocument, slides: DeckSlide[]): DeckDocument => ({ ...deck, slides });

// ---- slides ----------------------------------------------------------------

/** Starting arrangements for a new slide (placeholder text to type over). */
export const SLIDE_TEMPLATES = ["title", "section", "content", "split", "media", "blank"] as const;
export type SlideTemplate = (typeof SLIDE_TEMPLATES)[number];

export function slideFromTemplate(template: SlideTemplate, aspect: DeckAspect): DeckSlide {
  const fill: Record<SlideTemplate, () => Parameters<typeof newLegacySlide>[1]> = {
    title: () => ({ main: [heading("Title", 1), paragraph("Subtitle")] }),
    section: () => ({ main: [heading("Section", 1)] }),
    content: () => ({ main: [heading("Title", 2), bullet("A point"), bullet("Another point")] }),
    split: () => ({ main: [heading("Title", 2), bullet("A point")], side: [paragraph("Add a block here with /")] }),
    media: () => ({ main: [heading("Title", 2), paragraph("Add a block here with /")] }),
    blank: () => ({}),
  };
  const layout: SlideLayout = template === "media" ? "content" : template;
  const slide = upgradeSlide(newLegacySlide(layout, fill[template]()), aspect);
  return { ...slide, id: slideId() };
}

/** A new slide after `index` (or at the end). Returns the deck and the new slide's index. */
export function addSlide(deck: DeckDocument, index: number, template: SlideTemplate = "content"): { deck: DeckDocument; index: number } {
  const at = Math.max(0, Math.min(deck.slides.length, index + 1));
  const slides = [...deck.slides];
  slides.splice(at, 0, slideFromTemplate(template, deck.aspect));
  return { deck: withSlides(deck, slides), index: at };
}

/** Copies of objects with fresh ids (their blocks too), animations re-pointed; and the old → new object ids. */
function copyContent(elements: SlideElement[], animations: SlideAnimation[]) {
  const elementIds = new Map<string, string>();
  const blockIds = new Map<string, string>();
  const groups = new Map<string, string>();
  const copies = elements.map((e) => {
    const id = elementId();
    elementIds.set(e.id, id);
    const copy = { ...e, id } as SlideElement;
    if ("blocks" in copy) copy.blocks = copyBlocks(copy.blocks, blockIds);
    if (e.groupId) {
      if (!groups.has(e.groupId)) groups.set(e.groupId, elementId());
      copy.groupId = groups.get(e.groupId)!;
    }
    return copy;
  });
  const anims = animations.flatMap((a) =>
    elementIds.has(a.elementId)
      ? [{ ...a, id: animationId(), elementId: elementIds.get(a.elementId)!, ...(a.blockId ? { blockId: blockIds.get(a.blockId) ?? a.blockId } : {}) }]
      : [],
  );
  return { elements: copies, animations: anims, elementIds };
}

/**
 * A copy of a slide right after it. Its objects keep their ids (they're only
 * unique within a slide), so a morph from the original to the copy glides
 * every object you then move or resize — Keynote's Magic Move workflow.
 */
export function duplicateSlide(deck: DeckDocument, index: number): { deck: DeckDocument; index: number } {
  const slide = deck.slides[index];
  if (!slide) return { deck, index };
  const slides = [...deck.slides];
  slides.splice(index + 1, 0, { ...structuredClone(slide), id: slideId() });
  return { deck: withSlides(deck, slides), index: index + 1 };
}

/** Removes a slide; a deck always keeps at least one. Returns the index to select next. */
export function removeSlide(deck: DeckDocument, index: number): { deck: DeckDocument; index: number } {
  if (deck.slides.length <= 1 || !deck.slides[index]) return { deck, index: Math.min(index, deck.slides.length - 1) };
  const slides = deck.slides.filter((_, i) => i !== index);
  return { deck: withSlides(deck, slides), index: Math.min(index, slides.length - 1) };
}

export function moveSlide(deck: DeckDocument, from: number, to: number): DeckDocument {
  if (!deck.slides[from]) return deck;
  const slides = [...deck.slides];
  const [slide] = slides.splice(from, 1);
  slides.splice(Math.max(0, Math.min(slides.length, to)), 0, slide!);
  return withSlides(deck, slides);
}

/** Replaces one slide through `change`. */
export function updateSlide(deck: DeckDocument, id: string, change: (slide: DeckSlide) => DeckSlide): DeckDocument {
  return withSlides(
    deck,
    deck.slides.map((s) => (s.id === id ? change(s) : s)),
  );
}

// ---- objects ---------------------------------------------------------------

/** Ids plus the other members of any group they're in: a group selects as one. */
export function withGroups(slide: DeckSlide, ids: Iterable<string>): string[] {
  const picked = new Set(ids);
  const groups = new Set(slide.elements.filter((e) => picked.has(e.id) && e.groupId).map((e) => e.groupId));
  return slide.elements.filter((e) => picked.has(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id);
}

export function addElements(slide: DeckSlide, elements: SlideElement[]): DeckSlide {
  return { ...slide, elements: [...slide.elements, ...elements] };
}

/** Changes the given objects. Locked objects only change through `force` (unlocking, renaming). */
export function updateElements(slide: DeckSlide, ids: Iterable<string>, change: (e: SlideElement) => SlideElement, force = false): DeckSlide {
  const set = new Set(ids);
  return { ...slide, elements: slide.elements.map((e) => (set.has(e.id) && (force || !e.lock) ? change(e) : e)) };
}

/** Removes objects and the animations on them. Locked ones stay. */
export function removeElements(slide: DeckSlide, ids: Iterable<string>): DeckSlide {
  const gone = new Set(slide.elements.filter((e) => new Set(ids).has(e.id) && !e.lock).map((e) => e.id));
  return { ...slide, elements: slide.elements.filter((e) => !gone.has(e.id)), animations: slide.animations.filter((a) => !gone.has(a.elementId)) };
}

export function moveElements(slide: DeckSlide, ids: Iterable<string>, dx: number, dy: number): DeckSlide {
  return updateElements(slide, ids, (e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
}

/** Copies placed `offset` down and right, on top; returns the slide and the copies' ids. */
export function duplicateElements(slide: DeckSlide, ids: Iterable<string>, offset = 16): { slide: DeckSlide; ids: string[] } {
  const set = new Set(ids);
  const picked = slide.elements.filter((e) => set.has(e.id));
  const { elements, animations } = copyContent(picked, slide.animations.filter((a) => set.has(a.elementId)));
  const moved = elements.map((e) => ({ ...e, x: e.x + offset, y: e.y + offset }));
  return { slide: { ...slide, elements: [...slide.elements, ...moved], animations: [...slide.animations, ...animations] }, ids: moved.map((e) => e.id) };
}

/** Objects as clipboard data: copies with fresh ids and their animations, ready to paste. */
export function copyForClipboard(slide: DeckSlide, ids: Iterable<string>): { elements: SlideElement[]; animations: SlideAnimation[] } {
  const set = new Set(ids);
  return { elements: slide.elements.filter((e) => set.has(e.id)), animations: slide.animations.filter((a) => set.has(a.elementId)) };
}

export function pasteFromClipboard(slide: DeckSlide, clip: { elements: SlideElement[]; animations: SlideAnimation[] }, offset = 16): { slide: DeckSlide; ids: string[] } {
  const { elements, animations } = copyContent(clip.elements, clip.animations);
  // Pasted onto the slide it came from, it lands just off the original.
  const taken = new Set(slide.elements.map((e) => `${e.x},${e.y}`));
  const placed = elements.map((e) => (taken.has(`${e.x},${e.y}`) ? { ...e, x: e.x + offset, y: e.y + offset } : e));
  return { slide: { ...slide, elements: [...slide.elements, ...placed], animations: [...slide.animations, ...animations] }, ids: placed.map((e) => e.id) };
}

export type LayerMove = "front" | "forward" | "backward" | "back";

/** Changes drawing order (later draws on top), keeping the selection's own order. */
export function reorderElements(slide: DeckSlide, ids: Iterable<string>, move: LayerMove): DeckSlide {
  const set = new Set(ids);
  const list = [...slide.elements];
  if (move === "front") return { ...slide, elements: [...list.filter((e) => !set.has(e.id)), ...list.filter((e) => set.has(e.id))] };
  if (move === "back") return { ...slide, elements: [...list.filter((e) => set.has(e.id)), ...list.filter((e) => !set.has(e.id))] };
  if (move === "forward") {
    for (let i = list.length - 2; i >= 0; i--) if (set.has(list[i]!.id) && !set.has(list[i + 1]!.id)) [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
  } else {
    for (let i = 1; i < list.length; i++) if (set.has(list[i]!.id) && !set.has(list[i - 1]!.id)) [list[i], list[i - 1]] = [list[i - 1]!, list[i]!];
  }
  return { ...slide, elements: list };
}

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Lines objects up on an edge or centre: of the selection's bounds, or of
 * the slide when one object (or `toSlide`) is aligned.
 */
export function alignElements(slide: DeckSlide, ids: Iterable<string>, edge: AlignEdge, stage: { w: number; h: number }, toSlide = false): DeckSlide {
  const set = new Set(ids);
  const picked = slide.elements.filter((e) => set.has(e.id) && !e.lock);
  if (!picked.length) return slide;
  const frame: Box = toSlide || picked.length === 1 ? { x: 0, y: 0, w: stage.w, h: stage.h } : boundsOf(picked)!;
  return updateElements(slide, set, (e) => {
    const b = boundsOf([e])!;
    const dx = edge === "left" ? frame.x - b.x : edge === "right" ? frame.x + frame.w - (b.x + b.w) : edge === "center" ? centerOf(frame).x - centerOf(b).x : 0;
    const dy = edge === "top" ? frame.y - b.y : edge === "bottom" ? frame.y + frame.h - (b.y + b.h) : edge === "middle" ? centerOf(frame).y - centerOf(b).y : 0;
    return { ...e, x: e.x + dx, y: e.y + dy };
  });
}

/** Spreads three or more objects so the gaps between them are equal. */
export function distributeElements(slide: DeckSlide, ids: Iterable<string>, axis: "horizontal" | "vertical"): DeckSlide {
  const set = new Set(ids);
  const picked = slide.elements.filter((e) => set.has(e.id) && !e.lock);
  if (picked.length < 3) return slide;
  const pos = axis === "horizontal" ? "x" : "y";
  const size = axis === "horizontal" ? "w" : "h";
  const sorted = [...picked].sort((a, b) => a[pos] - b[pos]);
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const total = sorted.reduce((s, e) => s + e[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1);
  const target = new Map<string, number>();
  let at = first[pos];
  for (const e of sorted) {
    target.set(e.id, at);
    at += e[size] + gap;
  }
  return updateElements(slide, set, (e) => ({ ...e, [pos]: target.get(e.id) ?? e[pos] }));
}

export function groupElements(slide: DeckSlide, ids: Iterable<string>): DeckSlide {
  const set = new Set(ids);
  if (set.size < 2) return slide;
  const groupId = elementId();
  return updateElements(slide, set, (e) => ({ ...e, groupId }));
}

export function ungroupElements(slide: DeckSlide, ids: Iterable<string>): DeckSlide {
  return updateElements(slide, ids, ({ groupId: _g, ...e }) => e as SlideElement);
}

// ---- animations ------------------------------------------------------------

export const DEFAULT_DURATION: Record<AnimationType, number> = { in: 500, emphasis: 700, out: 400 };

/** Adds an effect at the end of the slide's timeline. */
export function addAnimation(
  slide: DeckSlide,
  elementId: string,
  type: AnimationType,
  effect = ANIMATION_EFFECTS[type][1] ?? ANIMATION_EFFECTS[type][0]!,
  opts: { trigger?: AnimationTrigger; blockId?: string; duration?: number; delay?: number } = {},
): { slide: DeckSlide; id: string } {
  const id = animationId();
  const animation: SlideAnimation = {
    id,
    elementId,
    ...(opts.blockId ? { blockId: opts.blockId } : {}),
    type,
    effect,
    trigger: opts.trigger ?? "click",
    duration: opts.duration ?? DEFAULT_DURATION[type],
    delay: opts.delay ?? 0,
  };
  return { slide: { ...slide, animations: [...slide.animations, animation] }, id };
}

/** A text box's points one click at a time: an entrance per top-level paragraph, replacing its other entrances. */
export function animateParagraphs(slide: DeckSlide, elementId: string, effect = "fade"): DeckSlide {
  const el = slide.elements.find((e) => e.id === elementId);
  if (!el || el.kind !== "text") return slide;
  const kept = slide.animations.filter((a) => !(a.elementId === elementId && a.type === "in"));
  const added = el.blocks
    .filter((b) => typeof b.id === "string" && b.type !== "heading")
    .map((b): SlideAnimation => ({ id: animationId(), elementId, blockId: b.id, type: "in", effect, trigger: "click", duration: DEFAULT_DURATION.in, delay: 0 }));
  return { ...slide, animations: [...kept, ...added] };
}

export function updateAnimation(slide: DeckSlide, id: string, patch: Partial<Omit<SlideAnimation, "id" | "elementId">>): DeckSlide {
  return {
    ...slide,
    animations: slide.animations.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...patch };
      // Changing the kind keeps a matching effect.
      if (patch.type && !ANIMATION_EFFECTS[next.type].includes(next.effect)) next.effect = ANIMATION_EFFECTS[next.type][1] ?? ANIMATION_EFFECTS[next.type][0]!;
      return next;
    }),
  };
}

export function removeAnimation(slide: DeckSlide, id: string): DeckSlide {
  return { ...slide, animations: slide.animations.filter((a) => a.id !== id) };
}

export function moveAnimation(slide: DeckSlide, id: string, to: number): DeckSlide {
  const list = [...slide.animations];
  const from = list.findIndex((a) => a.id === id);
  if (from < 0) return slide;
  const [a] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, a!);
  return { ...slide, animations: list };
}

/** Drops animations whose paragraph left its text box (after editing the text). */
export function pruneAnimations(slide: DeckSlide): DeckSlide {
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  const animations = slide.animations.filter((a) => {
    const el = byId.get(a.elementId);
    if (!el) return false;
    return !a.blockId || ("blocks" in el && allBlockIds(el.blocks).includes(a.blockId));
  });
  return animations.length === slide.animations.length ? slide : { ...slide, animations };
}
