/**
 * Presentations (decks): an ordered list of slides. Each slide has a layout
 * and holds ordinary note blocks (BlockNote JSON, the same schema notes use),
 * so every block a note can hold (quiz, custom app, video, mermaid…) can go on
 * a slide. Pure: safe in browsers, the API and the CLI.
 *
 * Steps ("builds") reveal a slide's blocks one click at a time; a slide's
 * transition plays on the way in. Presenting is driven by one position,
 * `{ slide, step }`, which a live audience follows too.
 */
/**
 * A note block as stored (BlockNote JSON). Loosely typed: the host app's
 * editor validates blocks; slides only read ids, types and text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoteBlock = Record<string, any>;

export const DECK_VERSION = 1;

/**
 * - title:   centred title and subtitle (the opening slide)
 * - section: a big heading between parts of a talk
 * - content: text, top to bottom
 * - split:   text on the left, `side` (a block, picture, app…) on the right
 * - media:   one block filling the slide (a video, an app, a diagram)
 * - canvas:  a live canvas zoomed to one of its frames or figures
 * - blank:   blocks placed with no heading treatment
 */
export const SLIDE_LAYOUTS = ["title", "section", "content", "split", "media", "canvas", "blank"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

/** `morph` moves blocks that appear on both slides to their new place (View Transitions). */
export const SLIDE_TRANSITIONS = ["none", "fade", "push", "zoom", "morph"] as const;
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number];

export const BUILD_EFFECTS = ["appear", "fade", "rise", "wipe", "highlight"] as const;
export type BuildEffect = (typeof BUILD_EFFECTS)[number];

export const DECK_THEMES = ["paper", "ink", "chalk"] as const;
export type DeckTheme = (typeof DECK_THEMES)[number];

export const DECK_ASPECTS = ["16:9", "4:3"] as const;
export type DeckAspect = (typeof DECK_ASPECTS)[number];

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

export interface DeckSlide {
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

/** Where a deck was made from, so "Update from source" can rebuild it. */
export interface DeckSource {
  kind: "page" | "project" | "notebook";
  id: string;
  split: SplitMode;
}

export type SplitMode = "heading" | "divider";

export interface DeckDocument {
  version: typeof DECK_VERSION;
  theme: DeckTheme;
  aspect: DeckAspect;
  /** The default transition between slides. */
  transition: SlideTransition;
  slides: DeckSlide[];
  /**
   * A copy of each canvas the slides show, by canvas id (octodraw documents,
   * opaque here). A deck carries its own copy, like it does the note's blocks,
   * so a published deck never needs the original canvas to be public.
   */
  canvases?: Record<string, unknown>;
}

/** Caps that keep a stored deck a reasonable size; the API refuses anything larger. */
export const DECK_LIMITS = {
  slides: 300,
  blocksPerSlide: 60,
  notesChars: 20_000,
  buildsPerSlide: 40,
} as const;

export const slideId = () => `s_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export function newSlide(layout: SlideLayout = "content", fill: Partial<Omit<DeckSlide, "id" | "layout">> = {}): DeckSlide {
  return { id: slideId(), layout, main: [], side: [], notes: "", ...fill };
}

export function emptyDeck(title = ""): DeckDocument {
  return {
    version: DECK_VERSION,
    theme: "paper",
    aspect: "16:9",
    transition: "fade",
    slides: [newSlide("title", { main: title ? [heading(title, 1)] : [] })],
  };
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const blocksOf = (v: unknown): NoteBlock[] => (Array.isArray(v) ? v.filter((b): b is NoteBlock => isObject(b) && typeof b.type === "string") : []);

/** The problems that make a stored deck invalid, or [] when it's fine. */
export function deckProblems(value: unknown): string[] {
  if (!isObject(value)) return ["A deck must be an object with a slides list."];
  if (value.version !== DECK_VERSION) return [`Deck version must be ${DECK_VERSION}.`];
  if (!Array.isArray(value.slides)) return ["A deck must have a slides list."];
  const problems: string[] = [];
  if (value.slides.length > DECK_LIMITS.slides) problems.push(`A deck can have at most ${DECK_LIMITS.slides} slides.`);
  const ids = new Set<string>();
  value.slides.forEach((s, i) => {
    const at = `Slide ${i + 1}`;
    if (!isObject(s)) return void problems.push(`${at} must be an object.`);
    if (typeof s.id !== "string" || !s.id) problems.push(`${at} needs an id.`);
    else if (ids.has(s.id)) problems.push(`${at} repeats the id ${s.id}.`);
    else ids.add(s.id);
    if (!SLIDE_LAYOUTS.includes(s.layout as SlideLayout)) problems.push(`${at} has an unknown layout.`);
    for (const key of ["main", "side"] as const) {
      if (!Array.isArray(s[key])) problems.push(`${at} ${key} must be a list of blocks.`);
      else if ((s[key] as unknown[]).length > DECK_LIMITS.blocksPerSlide) problems.push(`${at} has more than ${DECK_LIMITS.blocksPerSlide} blocks.`);
    }
    if (typeof s.notes !== "string") problems.push(`${at} notes must be text.`);
    else if (s.notes.length > DECK_LIMITS.notesChars) problems.push(`${at} notes are longer than ${DECK_LIMITS.notesChars} characters.`);
    if (s.layout === "canvas" && !(isObject(s.canvas) && typeof s.canvas.canvasId === "string")) problems.push(`${at} is a canvas slide without a canvas.`);
    if (s.builds !== undefined && (!Array.isArray(s.builds) || s.builds.length > DECK_LIMITS.buildsPerSlide)) problems.push(`${at} builds must be a list of at most ${DECK_LIMITS.buildsPerSlide}.`);
  });
  if (value.canvases !== undefined && !isObject(value.canvases)) problems.push("canvases must be an object of canvas documents by id.");
  return problems;
}

/**
 * Any stored value → a well-formed deck: unknown settings fall back to
 * defaults, malformed slides and blocks are dropped, builds that point at
 * missing blocks are removed. Never throws; what the editor and viewers load.
 */
export function toDeckDocument(value: unknown): DeckDocument {
  const raw = isObject(value) ? value : {};
  const seen = new Set<string>();
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).flatMap((s): DeckSlide[] => {
    if (!isObject(s)) return [];
    let id = typeof s.id === "string" && s.id ? s.id : slideId();
    if (seen.has(id)) id = slideId();
    seen.add(id);
    const layout = oneOf(SLIDE_LAYOUTS, s.layout, "content");
    const main = blocksOf(s.main);
    const side = blocksOf(s.side);
    const slide: DeckSlide = { id, layout, main, side, notes: typeof s.notes === "string" ? s.notes : "" };
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
    version: DECK_VERSION,
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

/** Ids of the blocks and their nested children (list items inside list items). */
export function allBlockIds(blocks: NoteBlock[]): string[] {
  return blocks.flatMap((b) => [...(typeof b.id === "string" ? [b.id] : []), ...allBlockIds(blocksOf(b.children))]);
}

/** The slides that are shown when presenting. */
export const visibleDeckSlides = (deck: DeckDocument) => deck.slides.filter((s) => !s.hidden);

/** How many clicks a slide takes before Next moves on: one per build. */
export const slideSteps = (slide: DeckSlide) => slide.builds?.length ?? 0;

/** A place in a presentation: slide index (among visible slides) and how many builds are showing. */
export interface DeckPosition {
  slide: number;
  step: number;
}

/** The position after one "Next": the next build, else the next slide's start. Stays put at the very end. */
export function nextPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  const slide = slides[at.slide];
  if (!slide) return clampPosition(slides, at);
  if (at.step < slideSteps(slide)) return { slide: at.slide, step: at.step + 1 };
  return at.slide + 1 < slides.length ? { slide: at.slide + 1, step: 0 } : at;
}

/** The position after one "Back": the previous build, else the previous slide fully built. */
export function previousPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  if (at.step > 0) return { slide: at.slide, step: at.step - 1 };
  if (at.slide === 0) return at;
  const prev = slides[at.slide - 1]!;
  return { slide: at.slide - 1, step: slideSteps(prev) };
}

export function clampPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  if (!slides.length) return { slide: 0, step: 0 };
  const slide = Math.max(0, Math.min(slides.length - 1, Math.floor(at.slide) || 0));
  const step = Math.max(0, Math.min(slideSteps(slides[slide]!), Math.floor(at.step) || 0));
  return { slide, step };
}

/** Plain text of a block's inline content (text, links, inline math as its LaTeX). */
export function blockText(block: NoteBlock): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: NoteBlock) => {
      if (typeof c?.text === "string") return c.text;
      if (Array.isArray(c?.content)) return c.content.map((x: NoteBlock) => x?.text ?? "").join("");
      if (c?.type === "math" && typeof c.props?.latex === "string") return `$${c.props.latex}$`;
      return "";
    })
    .join("");
}

/** The slide's title: its first heading, for the slide strip, outline and presenter view. */
export function slideTitle(slide: DeckSlide): string {
  const h = [...slide.main, ...slide.side].find((b) => b.type === "heading");
  return (h ? blockText(h) : "").trim();
}

export function heading(text: string, level: 1 | 2 | 3): NoteBlock {
  return {
    id: globalThis.crypto.randomUUID(),
    type: "heading",
    props: { level },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

export function paragraph(text: string): NoteBlock {
  return {
    id: globalThis.crypto.randomUUID(),
    type: "paragraph",
    props: {},
    content: text ? [{ type: "text", text, styles: {} }] : [],
    children: [],
  };
}
