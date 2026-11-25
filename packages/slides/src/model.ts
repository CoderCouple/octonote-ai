/**
 * Presentations (decks), version 2: free-form slides. A slide is a set of
 * objects placed on a fixed stage (960 × 540, or 720 × 540 for 4:3) — text
 * boxes, blocks (a quiz, a video, an app…), images, shapes and canvas views —
 * plus an animation timeline: entrance, emphasis and exit effects that run on
 * a click, with the previous effect, or after it.
 *
 * Text boxes and blocks hold ordinary note blocks (BlockNote JSON), so a
 * slide can carry anything a note can. Version-1 decks (fixed layouts) are
 * upgraded on load (see upgrade.ts). Pure: safe in browsers, the API and the CLI.
 */
import { allBlockIds, blocksOf, blockText, heading, isObject, type NoteBlock } from "./blocks.js";

export type { NoteBlock };

export const DECK_VERSION = 2;

/** `morph` moves objects that are on both slides to their new place and size (View Transitions). */
export const SLIDE_TRANSITIONS = ["none", "fade", "push", "zoom", "morph"] as const;
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number];

export const DECK_THEMES = ["paper", "ink", "chalk", "ocean", "sunset", "contrast"] as const;
export type DeckTheme = (typeof DECK_THEMES)[number];

export const DECK_ASPECTS = ["16:9", "4:3"] as const;
export type DeckAspect = (typeof DECK_ASPECTS)[number];

/** The stage size, in slide units: objects are placed in these coordinates. */
export const SLIDE_SIZE: Record<DeckAspect, { w: number; h: number }> = {
  "16:9": { w: 960, h: 540 },
  "4:3": { w: 720, h: 540 },
};

export const ELEMENT_KINDS = ["text", "block", "image", "shape", "canvas"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const SHAPES = ["rect", "rounded", "ellipse", "triangle", "diamond", "arrow", "line"] as const;
export type ShapeName = (typeof SHAPES)[number];

/** How an object looks, beyond what it holds. Colours are CSS colours or theme tokens (`accent`, `surface`, `fg`, `muted`, `line`). */
export interface ElementStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Corner radius, in slide units. */
  radius?: number;
  /** 0–1. */
  opacity?: number;
  /** Space between the box's edge and its text, in slide units. */
  padding?: number;
  vAlign?: "top" | "middle" | "bottom";
  textAlign?: "left" | "center" | "right";
  /** Text size relative to the slide's base size (1 = normal). */
  fontScale?: number;
}

interface ElementBase {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees clockwise about the centre. */
  rotate?: number;
  /** Can't be selected by clicking on the slide, moved or resized. */
  lock?: boolean;
  /** Objects with the same group id select and move together. */
  groupId?: string;
  /** What the layers list calls it. */
  name?: string;
  style?: ElementStyle;
}

/** Rich text: headings, points, maths, code… edited in place. */
export interface TextElement extends ElementBase {
  kind: "text";
  blocks: NoteBlock[];
  /** A title box: what the slide strip, outline and presenter view call the slide. */
  role?: "title";
}

/** One block that's the point by itself: a quiz, widget, app, video, mermaid diagram, table. */
export interface BlockElement extends ElementBase {
  kind: "block";
  blocks: NoteBlock[];
}

export interface ImageElement extends ElementBase {
  kind: "image";
  src: string;
  alt?: string;
  fit?: "contain" | "cover";
}

export interface ShapeElement extends ElementBase {
  kind: "shape";
  shape: ShapeName;
}

/** A canvas from the deck's own copy, zoomed to one frame or figure (or the whole canvas). */
export interface CanvasElement extends ElementBase {
  kind: "canvas";
  canvasId: string;
  itemId: string | null;
}

export type SlideElement = TextElement | BlockElement | ImageElement | ShapeElement | CanvasElement;

export const ANIMATION_TYPES = ["in", "emphasis", "out"] as const;
export type AnimationType = (typeof ANIMATION_TYPES)[number];

/** Each effect's keyframes live in styles.css as `osl-fx-<effect>`. */
export const ANIMATION_EFFECTS: Record<AnimationType, readonly string[]> = {
  in: ["appear", "fade", "rise", "drop", "fly-left", "fly-right", "zoom", "pop", "wipe", "blur"],
  emphasis: ["pulse", "highlight", "grow", "shake", "spin", "flash"],
  out: ["disappear", "fade-out", "sink", "fly-out-left", "fly-out-right", "zoom-out"],
};

export const ANIMATION_TRIGGERS = ["click", "with", "after"] as const;
export type AnimationTrigger = (typeof ANIMATION_TRIGGERS)[number];

/**
 * One effect on one object (or on one paragraph of a text box, `blockId`).
 * In slide order: `click` waits for a click; `with` starts with the previous
 * effect; `after` starts when the previous one ends.
 */
export interface SlideAnimation {
  id: string;
  elementId: string;
  /** A paragraph or point inside a text box, to reveal it on its own. */
  blockId?: string;
  type: AnimationType;
  effect: string;
  trigger: AnimationTrigger;
  /** Milliseconds. */
  duration: number;
  /** Milliseconds before it starts (after its trigger). */
  delay: number;
}

export interface DeckSlide {
  id: string;
  /** Back to front: later objects draw on top. */
  elements: SlideElement[];
  animations: SlideAnimation[];
  /** Presenter notes (markdown), seen only in the presenter view. */
  notes: string;
  /** `surface` (the theme's second background), a theme token or a CSS colour; the theme's background when left out. */
  background?: string;
  /** Overrides the deck's transition for the way into this slide. */
  transition?: SlideTransition;
  /** Kept in the deck but skipped when presenting. */
  hidden?: boolean;
}

export type SplitMode = "heading" | "divider";

/** Where a deck was made from, so "Update from source" can rebuild it. */
export interface DeckSource {
  kind: "page" | "project" | "notebook";
  id: string;
  split: SplitMode;
}

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
  elementsPerSlide: 80,
  blocksPerElement: 60,
  animationsPerSlide: 120,
  notesChars: 20_000,
} as const;

const shortId = (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
export const slideId = () => shortId("s");
export const elementId = () => shortId("e");
export const animationId = () => shortId("a");

export const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

const num = (v: unknown, fallback: number, min = -1e6, max = 1e6) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

export function newSlide(fill: Partial<Omit<DeckSlide, "id">> = {}): DeckSlide {
  return { id: slideId(), elements: [], animations: [], notes: "", ...fill };
}

/** A text box at a place on the stage. */
export function textElement(blocks: NoteBlock[], box: { x: number; y: number; w: number; h: number }, extra: Partial<Omit<TextElement, "kind" | "blocks">> = {}): TextElement {
  return { id: elementId(), kind: "text", ...box, blocks, ...extra };
}

export function blockElement(block: NoteBlock, box: { x: number; y: number; w: number; h: number }, extra: Partial<Omit<BlockElement, "kind" | "blocks">> = {}): BlockElement {
  return { id: elementId(), kind: "block", ...box, blocks: [block], ...extra };
}

export function emptyDeck(title = ""): DeckDocument {
  return {
    version: DECK_VERSION,
    theme: "paper",
    aspect: "16:9",
    transition: "fade",
    slides: [newSlide({ elements: [textElement([heading(title || "Untitled presentation", 1)], { x: 80, y: 190, w: 800, h: 160 }, { role: "title", style: { vAlign: "middle" } })] })],
  };
}

const STYLE_COLORS = ["fill", "stroke"] as const;

/** Only the style fields we know, with sane values; colours are kept as text (they're only ever used as CSS values). */
function cleanStyle(v: unknown): ElementStyle | undefined {
  if (!isObject(v)) return undefined;
  const s: ElementStyle = {};
  for (const key of STYLE_COLORS) {
    const value = v[key];
    if (typeof value === "string" && value.length <= 64 && !/[;{}<>]/.test(value)) s[key] = value;
  }
  if (typeof v.strokeWidth === "number") s.strokeWidth = num(v.strokeWidth, 0, 0, 40);
  if (typeof v.radius === "number") s.radius = num(v.radius, 0, 0, 400);
  if (typeof v.opacity === "number") s.opacity = num(v.opacity, 1, 0, 1);
  if (typeof v.padding === "number") s.padding = num(v.padding, 0, 0, 200);
  if (typeof v.fontScale === "number") s.fontScale = num(v.fontScale, 1, 0.3, 6);
  if (["top", "middle", "bottom"].includes(v.vAlign as string)) s.vAlign = v.vAlign as ElementStyle["vAlign"];
  if (["left", "center", "right"].includes(v.textAlign as string)) s.textAlign = v.textAlign as ElementStyle["textAlign"];
  return Object.keys(s).length ? s : undefined;
}

/** Any stored object → a well-formed one, or null when it can't be (unknown kind, no canvas…). */
function cleanElement(v: unknown, seen: Set<string>): SlideElement | null {
  if (!isObject(v) || !ELEMENT_KINDS.includes(v.kind as ElementKind)) return null;
  let id = typeof v.id === "string" && v.id ? v.id : elementId();
  if (seen.has(id)) id = elementId();
  seen.add(id);
  const turn = num(v.rotate, 0);
  const base = {
    id,
    x: num(v.x, 0, -2000, 3000),
    y: num(v.y, 0, -2000, 3000),
    w: num(v.w, 200, 4, 4000),
    h: num(v.h, 100, 4, 4000),
    ...(turn % 360 ? { rotate: ((turn % 360) + 360) % 360 } : {}),
    ...(v.lock === true ? { lock: true } : {}),
    ...(typeof v.groupId === "string" && v.groupId ? { groupId: v.groupId } : {}),
    ...(typeof v.name === "string" && v.name.trim() ? { name: v.name.trim().slice(0, 80) } : {}),
  };
  const style = cleanStyle(v.style);
  const styled = style ? { style } : {};
  switch (v.kind as ElementKind) {
    case "text":
      return { ...base, kind: "text", blocks: blocksOf(v.blocks).slice(0, DECK_LIMITS.blocksPerElement), ...(v.role === "title" ? { role: "title" as const } : {}), ...styled };
    case "block":
      return { ...base, kind: "block", blocks: blocksOf(v.blocks).slice(0, DECK_LIMITS.blocksPerElement), ...styled };
    case "image":
      return typeof v.src === "string" && /^(https?:|data:image\/)/.test(v.src)
        ? { ...base, kind: "image", src: v.src, ...(typeof v.alt === "string" ? { alt: v.alt.slice(0, 300) } : {}), fit: v.fit === "cover" ? "cover" : "contain", ...styled }
        : null;
    case "shape":
      return { ...base, kind: "shape", shape: oneOf(SHAPES, v.shape, "rect"), ...styled };
    case "canvas":
      return typeof v.canvasId === "string" ? { ...base, kind: "canvas", canvasId: v.canvasId, itemId: typeof v.itemId === "string" ? v.itemId : null, ...styled } : null;
  }
}

function cleanAnimation(v: unknown, elements: Map<string, SlideElement>): SlideAnimation | null {
  if (!isObject(v) || typeof v.elementId !== "string") return null;
  const el = elements.get(v.elementId);
  if (!el) return null;
  const type = oneOf(ANIMATION_TYPES, v.type, "in");
  const effects = ANIMATION_EFFECTS[type];
  // A paragraph target must still be in the text box.
  const blockId = typeof v.blockId === "string" && "blocks" in el && allBlockIds(el.blocks).includes(v.blockId) ? v.blockId : undefined;
  return {
    id: typeof v.id === "string" && v.id ? v.id : animationId(),
    elementId: v.elementId,
    ...(blockId ? { blockId } : {}),
    type,
    effect: effects.includes(v.effect as string) ? (v.effect as string) : effects[0]!,
    trigger: oneOf(ANIMATION_TRIGGERS, v.trigger, "click"),
    duration: num(v.duration, 500, 0, 20_000),
    delay: num(v.delay, 0, 0, 60_000),
  };
}

/** A version-2 slide as stored → a well-formed one. Never throws. */
export function cleanSlide(v: Record<string, unknown>, seenSlides: Set<string>): DeckSlide {
  let id = typeof v.id === "string" && v.id ? v.id : slideId();
  if (seenSlides.has(id)) id = slideId();
  seenSlides.add(id);
  const seenElements = new Set<string>();
  const elements = (Array.isArray(v.elements) ? v.elements : [])
    .slice(0, DECK_LIMITS.elementsPerSlide)
    .flatMap((e) => cleanElement(e, seenElements) ?? []);
  const byId = new Map(elements.map((e) => [e.id, e]));
  const animations = (Array.isArray(v.animations) ? v.animations : []).slice(0, DECK_LIMITS.animationsPerSlide).flatMap((a) => cleanAnimation(a, byId) ?? []);
  const slide: DeckSlide = { id, elements, animations, notes: typeof v.notes === "string" ? v.notes.slice(0, DECK_LIMITS.notesChars) : "" };
  if (typeof v.background === "string" && v.background.length <= 64 && !/[;{}<>]/.test(v.background)) slide.background = v.background;
  if (SLIDE_TRANSITIONS.includes(v.transition as SlideTransition)) slide.transition = v.transition as SlideTransition;
  if (v.hidden === true) slide.hidden = true;
  return slide;
}

/** The problems that make a stored version-2 deck invalid, or [] when it's fine. */
export function deckV2Problems(value: Record<string, unknown>): string[] {
  if (!Array.isArray(value.slides)) return ["A deck must have a slides list."];
  const problems: string[] = [];
  if (!value.slides.length) problems.push("A deck needs at least one slide.");
  if (value.slides.length > DECK_LIMITS.slides) problems.push(`A deck can have at most ${DECK_LIMITS.slides} slides.`);
  const ids = new Set<string>();
  value.slides.forEach((s, i) => {
    const at = `Slide ${i + 1}`;
    if (!isObject(s)) return void problems.push(`${at} must be an object.`);
    if (typeof s.id !== "string" || !s.id) problems.push(`${at} needs an id.`);
    else if (ids.has(s.id)) problems.push(`${at} repeats the id ${s.id}.`);
    else ids.add(s.id);
    if (!Array.isArray(s.elements)) return void problems.push(`${at} needs an elements list.`);
    if (s.elements.length > DECK_LIMITS.elementsPerSlide) problems.push(`${at} has more than ${DECK_LIMITS.elementsPerSlide} objects.`);
    const elementIds = new Set<string>();
    s.elements.forEach((e, j) => {
      const which = `${at}, object ${j + 1}`;
      if (!isObject(e)) return void problems.push(`${which} must be an object.`);
      if (!ELEMENT_KINDS.includes(e.kind as ElementKind)) problems.push(`${which} has an unknown kind.`);
      if (typeof e.id !== "string" || !e.id) problems.push(`${which} needs an id.`);
      else if (elementIds.has(e.id)) problems.push(`${which} repeats the id ${e.id}.`);
      else elementIds.add(e.id);
      for (const k of ["x", "y", "w", "h"]) if (typeof e[k] !== "number" || !Number.isFinite(e[k])) problems.push(`${which} needs a numeric ${k}.`);
      if ((e.kind === "text" || e.kind === "block") && !Array.isArray(e.blocks)) problems.push(`${which} needs a blocks list.`);
      if (e.kind === "canvas" && typeof e.canvasId !== "string") problems.push(`${which} is a canvas without a canvas.`);
      if (e.kind === "image" && typeof e.src !== "string") problems.push(`${which} is an image without a source.`);
    });
    if (s.animations !== undefined && (!Array.isArray(s.animations) || s.animations.length > DECK_LIMITS.animationsPerSlide)) problems.push(`${at} animations must be a list of at most ${DECK_LIMITS.animationsPerSlide}.`);
    if (typeof s.notes !== "string") problems.push(`${at} notes must be text.`);
    else if (s.notes.length > DECK_LIMITS.notesChars) problems.push(`${at} notes are longer than ${DECK_LIMITS.notesChars} characters.`);
  });
  if (value.canvases !== undefined && !isObject(value.canvases)) problems.push("canvases must be an object of canvas documents by id.");
  return problems;
}

/** Repairs a version-2 deck (see cleanSlide); keeps only the canvas copies an object still shows. */
export function cleanDeck(raw: Record<string, unknown>): DeckDocument {
  const seen = new Set<string>();
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).slice(0, DECK_LIMITS.slides).flatMap((s) => (isObject(s) ? [cleanSlide(s, seen)] : []));
  const used = new Set(slides.flatMap((s) => s.elements.flatMap((e) => (e.kind === "canvas" ? [e.canvasId] : []))));
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

/** The slides that are shown when presenting. */
export const visibleDeckSlides = (deck: DeckDocument) => deck.slides.filter((s) => !s.hidden);

/** The slide's title: its title box's text, else its first heading anywhere. */
export function slideTitle(slide: DeckSlide): string {
  const texts = slide.elements.filter((e): e is TextElement => e.kind === "text");
  const titled = texts.find((t) => t.role === "title") ?? texts.find((t) => t.blocks.some((b) => b.type === "heading"));
  const block = titled?.blocks.find((b) => b.type === "heading") ?? titled?.blocks.find((b) => blockText(b).trim());
  return (block ? blockText(block) : "").trim();
}

/** Every note block on a slide, in reading order (text boxes and blocks). */
export const slideBlocks = (slide: DeckSlide): NoteBlock[] => slide.elements.flatMap((e) => ("blocks" in e ? e.blocks : []));
