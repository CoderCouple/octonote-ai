/**
 * Editing a deck: pure functions that return a new deck, so editors get
 * undo-friendly updates and every rule (ids stay unique, builds point at
 * real blocks) lives in one tested place.
 */
import {
  allBlockIds,
  newSlide,
  slideId,
  type BuildEffect,
  type DeckDocument,
  type DeckSlide,
  type NoteBlock,
  type SlideLayout,
} from "./model.js";

const withSlides = (deck: DeckDocument, slides: DeckSlide[]): DeckDocument => ({ ...deck, slides });

/** Fresh ids for a copied block and its children (so the copy's builds and morphs are its own). */
function copyBlock(block: NoteBlock): NoteBlock {
  return {
    ...block,
    id: globalThis.crypto.randomUUID(),
    children: Array.isArray(block.children) ? block.children.map(copyBlock) : [],
  };
}

/** A new slide after `index` (or at the end). Returns the deck and the new slide's index. */
export function addSlide(deck: DeckDocument, index: number, layout: SlideLayout = "content"): { deck: DeckDocument; index: number } {
  const at = Math.max(0, Math.min(deck.slides.length, index + 1));
  const slides = [...deck.slides];
  slides.splice(at, 0, newSlide(layout));
  return { deck: withSlides(deck, slides), index: at };
}

export function duplicateSlide(deck: DeckDocument, index: number): { deck: DeckDocument; index: number } {
  const slide = deck.slides[index];
  if (!slide) return { deck, index };
  const ids = new Map<string, string>();
  const remap = (blocks: NoteBlock[]) =>
    blocks.map((b) => {
      const copy = copyBlock(b);
      const pair = (from: NoteBlock, to: NoteBlock) => {
        if (typeof from.id === "string") ids.set(from.id, to.id);
        (from.children ?? []).forEach((c: NoteBlock, i: number) => pair(c, to.children[i]));
      };
      pair(b, copy);
      return copy;
    });
  const main = remap(slide.main);
  const side = remap(slide.side);
  const copy: DeckSlide = {
    ...slide,
    id: slideId(),
    main,
    side,
    builds: slide.builds?.flatMap((b) => (ids.has(b.blockId) ? [{ ...b, blockId: ids.get(b.blockId)! }] : [])),
  };
  if (!copy.builds?.length) delete copy.builds;
  const slides = [...deck.slides];
  slides.splice(index + 1, 0, copy);
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

/**
 * Changes one slide. Builds whose block is gone (deleted, or moved off a
 * region the new layout doesn't show) are dropped.
 */
export function updateSlide(deck: DeckDocument, id: string, patch: Partial<Omit<DeckSlide, "id">>): DeckDocument {
  return withSlides(
    deck,
    deck.slides.map((s) => {
      if (s.id !== id) return s;
      const next: DeckSlide = { ...s, ...patch };
      const shown = new Set(allBlockIds(next.layout === "split" ? [...next.main, ...next.side] : next.main));
      const builds = next.builds?.filter((b) => shown.has(b.blockId));
      if (builds?.length) next.builds = builds;
      else delete next.builds;
      if (next.layout !== "canvas") delete next.canvas;
      return next;
    }),
  );
}

/** Reveals a block on click with `effect`, or (null) shows it from the start. New builds go last. */
export function setBuild(slide: DeckSlide, blockId: string, effect: BuildEffect | null): DeckSlide["builds"] {
  const builds = slide.builds ?? [];
  const at = builds.findIndex((b) => b.blockId === blockId);
  if (effect === null) {
    const rest = builds.filter((b) => b.blockId !== blockId);
    return rest.length ? rest : undefined;
  }
  if (at >= 0) return builds.map((b, i) => (i === at ? { ...b, effect } : b));
  return [...builds, { blockId, effect }];
}

/** Moves a build one click earlier (-1) or later (+1). */
export function moveBuild(slide: DeckSlide, blockId: string, by: -1 | 1): DeckSlide["builds"] {
  const builds = [...(slide.builds ?? [])];
  const at = builds.findIndex((b) => b.blockId === blockId);
  const to = at + by;
  if (at < 0 || to < 0 || to >= builds.length) return slide.builds;
  [builds[at], builds[to]] = [builds[to]!, builds[at]!];
  return builds;
}

/** Each top-level block (and list item) of a slide in reading order, for the builds list. */
export function buildableBlocks(slide: DeckSlide): NoteBlock[] {
  const regions = slide.layout === "split" ? [...slide.main, ...slide.side] : slide.main;
  return regions.filter((b) => typeof b.id === "string");
}
