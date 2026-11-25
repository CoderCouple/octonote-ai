/**
 * The first presentation format (version 1), kept to read and upgrade decks
 * saved before slides became free-form (see upgrade.ts). In it, an ordered
 * list of slides. Each slide has a layout
 * and holds ordinary note blocks (BlockNote JSON, the same schema notes use),
 * so every block a note can hold (quiz, custom app, video, mermaid…) can go on
 * a slide. Pure: safe in browsers, the API and the CLI.
 *
 * Steps ("builds") reveal a slide's blocks one click at a time; a slide's
 * transition plays on the way in. Presenting is driven by one position,
 * `{ slide, step }`, which a live audience follows too.
 */
import { allBlockIds, blocksOf, heading, isObject, type NoteBlock } from "./blocks.js";
import { DECK_ASPECTS, DECK_THEMES, SLIDE_TRANSITIONS, oneOf, slideId, type DeckAspect, type DeckTheme, type SlideTransition } from "./model.js";

export type { NoteBlock };

export const LEGACY_VERSION = 1;

/**
 * - title:   centred title and subtitle (the opening slide)
 * - section: a big heading between parts of a talk
 * - content: text, top to bottom
 * - split:   text on the left, `side` (a block, picture, app…) on the right
 * - media:   one block filling the slide (a video, an app, a diagram)
 * - canvas:  a live canvas zoomed to one of its frames or figures
 * - blank:   blocks placed with no heading treatment
 */
export const LEGACY_LAYOUTS = ["title", "section", "content", "split", "media", "canvas", "blank"] as const;
export type SlideLayout = (typeof LEGACY_LAYOUTS)[number];

export const BUILD_EFFECTS = ["appear", "fade", "rise", "wipe", "highlight"] as const;
export type BuildEffect = (typeof BUILD_EFFECTS)[number];

/** One click on a slide: the block it reveals and how. Order in `builds` is click order. */
export interface SlideBuild {
  blockId: string;
  effect: BuildEffect;
}

/** A canvas shown on a slide, zoomed to `itemId` (a frame or figure), or the whole canvas when null. */
export interface SlideCanvas {
  canvasId: string;
  itemId: string | null;
}

export interface LegacySlide {
  id: string;
  layout: SlideLayout;
  /** The slide's blocks (for `split`, the left column). */
  main: NoteBlock[];
  /** The right column of a `split` slide; empty otherwise. */
  side: NoteBlock[];
  /** Presenter notes (markdown), seen only in the presenter view. */
  notes: string;
  /** Set on `canvas` slides. */
  canvas?: SlideCanvas;
  builds?: SlideBuild[];
  /** Overrides the deck's transition for the way into this slide. */
  transition?: SlideTransition;
  /** Kept in the deck but skipped when presenting. */
  hidden?: boolean;
}

export interface LegacyDeck {
  version: typeof LEGACY_VERSION;
  theme: DeckTheme;
  aspect: DeckAspect;
  /** The default transition between slides. */
  transition: SlideTransition;
  slides: LegacySlide[];
  /**
   * A copy of each canvas the slides show, by canvas id (octodraw documents,
   * opaque here). A deck carries its own copy, like it does the note's blocks,
   * so a published deck never needs the original canvas to be public.
   */
  canvases?: Record<string, unknown>;
}

/** Caps that keep a stored deck a reasonable size; the API refuses anything larger. */
const LIMITS = { slides: 300, blocksPerSlide: 60, notesChars: 20_000, buildsPerSlide: 40 } as const;


export function newLegacySlide(layout: SlideLayout = "content", fill: Partial<Omit<LegacySlide, "id" | "layout">> = {}): LegacySlide {
  return { id: slideId(), layout, main: [], side: [], notes: "", ...fill };
}

/** The problems that make a version-1 deck invalid, or [] when it's fine. */
export function legacyDeckProblems(value: unknown): string[] {
  if (!isObject(value)) return ["A deck must be an object with a slides list."];
  if (value.version !== LEGACY_VERSION) return [`Deck version must be ${LEGACY_VERSION}.`];
  if (!Array.isArray(value.slides)) return ["A deck must have a slides list."];
  const problems: string[] = [];
  if (value.slides.length > LIMITS.slides) problems.push(`A deck can have at most ${LIMITS.slides} slides.`);
  const ids = new Set<string>();
  value.slides.forEach((s, i) => {
    const at = `Slide ${i + 1}`;
    if (!isObject(s)) return void problems.push(`${at} must be an object.`);
    if (typeof s.id !== "string" || !s.id) problems.push(`${at} needs an id.`);
    else if (ids.has(s.id)) problems.push(`${at} repeats the id ${s.id}.`);
    else ids.add(s.id);
    if (!LEGACY_LAYOUTS.includes(s.layout as SlideLayout)) problems.push(`${at} has an unknown layout.`);
    for (const key of ["main", "side"] as const) {
      if (!Array.isArray(s[key])) problems.push(`${at} ${key} must be a list of blocks.`);
      else if ((s[key] as unknown[]).length > LIMITS.blocksPerSlide) problems.push(`${at} has more than ${LIMITS.blocksPerSlide} blocks.`);
    }
    if (typeof s.notes !== "string") problems.push(`${at} notes must be text.`);
    else if (s.notes.length > LIMITS.notesChars) problems.push(`${at} notes are longer than ${LIMITS.notesChars} characters.`);
    if (s.layout === "canvas" && !(isObject(s.canvas) && typeof s.canvas.canvasId === "string")) problems.push(`${at} is a canvas slide without a canvas.`);
    if (s.builds !== undefined && (!Array.isArray(s.builds) || s.builds.length > LIMITS.buildsPerSlide)) problems.push(`${at} builds must be a list of at most ${LIMITS.buildsPerSlide}.`);
  });
  if (value.canvases !== undefined && !isObject(value.canvases)) problems.push("canvases must be an object of canvas documents by id.");
  return problems;
}

/**
 * Any stored value → a well-formed deck: unknown settings fall back to
 * defaults, malformed slides and blocks are dropped, builds that point at
 * missing blocks are removed. Never throws; what the editor and viewers load.
 */
export function repairLegacyDeck(value: unknown): LegacyDeck {
  const raw = isObject(value) ? value : {};
  const seen = new Set<string>();
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).flatMap((s): LegacySlide[] => {
    if (!isObject(s)) return [];
    let id = typeof s.id === "string" && s.id ? s.id : slideId();
    if (seen.has(id)) id = slideId();
    seen.add(id);
    const layout = oneOf(LEGACY_LAYOUTS, s.layout, "content");
    const main = blocksOf(s.main);
    const side = blocksOf(s.side);
    const slide: LegacySlide = { id, layout, main, side, notes: typeof s.notes === "string" ? s.notes : "" };
    if (isObject(s.canvas) && typeof s.canvas.canvasId === "string") {
      slide.canvas = { canvasId: s.canvas.canvasId, itemId: typeof s.canvas.itemId === "string" ? s.canvas.itemId : null };
    } else if (layout === "canvas") slide.layout = "blank";
    const blockIds = new Set(allBlockIds([...main, ...side]));
    const builds = (Array.isArray(s.builds) ? s.builds : []).flatMap((b): SlideBuild[] =>
      isObject(b) && typeof b.blockId === "string" && blockIds.has(b.blockId) ? [{ blockId: b.blockId, effect: oneOf(BUILD_EFFECTS, b.effect, "appear") }] : [],
    );
    if (builds.length) slide.builds = dedupeBuilds(builds);
    if (SLIDE_TRANSITIONS.includes(s.transition as SlideTransition)) slide.transition = s.transition as SlideTransition;
    if (s.hidden === true) slide.hidden = true;
    return [slide];
  });
  // Keep only the canvas copies a slide still shows.
  const used = new Set(slides.flatMap((s) => (s.canvas ? [s.canvas.canvasId] : [])));
  const canvases = Object.fromEntries(Object.entries(isObject(raw.canvases) ? raw.canvases : {}).filter(([id, doc]) => used.has(id) && isObject(doc)));
  return {
    version: LEGACY_VERSION,
    theme: oneOf(DECK_THEMES, raw.theme, "paper"),
    aspect: oneOf(DECK_ASPECTS, raw.aspect, "16:9"),
    transition: oneOf(SLIDE_TRANSITIONS, raw.transition, "fade"),
    slides,
    ...(Object.keys(canvases).length ? { canvases } : {}),
  };
}

function dedupeBuilds(builds: SlideBuild[]): SlideBuild[] {
  const seen = new Set<string>();
  return builds.filter((b) => (seen.has(b.blockId) ? false : (seen.add(b.blockId), true)));
}

