/**
 * Notes, projects and notebooks → slides. Pure and deterministic apart from
 * new ids, so the app can preview the result before making the deck and the
 * API or CLI can build the same deck.
 *
 * A note splits into sections at its headings (H1/H2) or at its dividers.
 * Each section becomes a slide: text on the left, its block (quiz, video,
 * app, diagram…) on the right, or the block alone when there's no text. With
 * `textToNotes`, paragraphs move to the presenter notes and the slide keeps
 * the points (lists, formulas, code), the way a speaker would cut a script
 * down to slides.
 */
import {
  blockText,
  DECK_LIMITS,
  DECK_VERSION,
  heading,
  newSlide,
  paragraph,
  type DeckDocument,
  type DeckSlide,
  type NoteBlock,
  type SplitMode,
} from "./model.js";

export interface ConvertOptions {
  /** Where one slide ends and the next begins. */
  split: SplitMode;
  /** Paragraphs go to the presenter notes; the slide keeps lists, formulas and code. */
  textToNotes: boolean;
  /** Each block (quiz, video, app…) on its own slide, instead of all of a section's blocks on one. */
  onePerSlide: boolean;
}

export const DEFAULT_CONVERT: ConvertOptions = { split: "heading", textToNotes: true, onePerSlide: true };

/** Blocks that are the point of a slide on their own: they go on the right, or fill the slide. */
const MEDIA_TYPES = new Set(["interactive", "manimVideo", "mermaid", "figure", "canvasReference", "image", "video", "audio", "file", "table"]);

/** The text blocks a slide keeps when paragraphs move to the notes. */
const POINT_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "mathBlock", "codeBlock", "heading"]);

/** A paragraph this short may stay on a slide that would otherwise have no text. */
const LEAD_MAX_CHARS = 240;
/** More text blocks than this continue on a second slide. */
const TEXT_PER_SLIDE = 7;

export const isMediaBlock = (b: NoteBlock) => MEDIA_TYPES.has(b.type);

const isEmptyParagraph = (b: NoteBlock) => b.type === "paragraph" && !blockText(b).trim();

/** A canvas's slides, in presenting order (from the canvas's own presentation settings). */
export interface CanvasSlideRef {
  /** The frame or figure, or null for the whole canvas. */
  itemId: string | null;
  title: string;
}

export interface NoteSource {
  title: string;
  blocks: NoteBlock[];
}

export interface CanvasSource {
  title: string;
  canvasId: string;
  slides: CanvasSlideRef[];
  /** The canvas document, copied into the deck so its slides draw without the original. */
  document: unknown;
}

export interface ProjectSource {
  title: string;
  note: NoteSource | null;
  canvas: CanvasSource | null;
}

export type NotebookEntry =
  | ({ kind: "page" } & NoteSource)
  | ({ kind: "project" } & ProjectSource)
  | ({ kind: "canvas" } & CanvasSource);

export interface NotebookSource {
  title: string;
  items: NotebookEntry[];
}

export function deckFromNote(note: NoteSource, options: ConvertOptions = DEFAULT_CONVERT): DeckDocument {
  return deckOf(noteSlides(note, options, true));
}

export function deckFromProject(project: ProjectSource, options: ConvertOptions = DEFAULT_CONVERT): DeckDocument {
  return deckOf(projectSlides(project, options, true), project.canvas ? [project.canvas] : []);
}

/** A title slide for the notebook, then each item as its own section in notebook order. */
export function deckFromNotebook(notebook: NotebookSource, options: ConvertOptions = DEFAULT_CONVERT): DeckDocument {
  const slides = [titleSlide(notebook.title, null)];
  for (const item of notebook.items) {
    slides.push(newSlide("section", { main: [heading(item.title || "Untitled", 1)] }));
    if (item.kind === "page") slides.push(...noteSlides(item, options, false));
    else if (item.kind === "project") slides.push(...projectSlides(item, options, false));
    else slides.push(...canvasSlides(item));
  }
  const canvases = notebook.items.flatMap((i) => (i.kind === "canvas" ? [i] : i.kind === "project" && i.canvas ? [i.canvas] : []));
  return deckOf(slides, canvases);
}

function deckOf(slides: DeckSlide[], canvases: CanvasSource[] = []): DeckDocument {
  const kept = slides.slice(0, DECK_LIMITS.slides);
  const used = new Set(kept.flatMap((s) => (s.canvas ? [s.canvas.canvasId] : [])));
  const copies = Object.fromEntries(canvases.filter((c) => used.has(c.canvasId)).map((c) => [c.canvasId, c.document]));
  return {
    version: DECK_VERSION,
    theme: "paper",
    aspect: "16:9",
    transition: "fade",
    slides: kept,
    ...(Object.keys(copies).length ? { canvases: copies } : {}),
  };
}

function projectSlides(project: ProjectSource, options: ConvertOptions, withTitle: boolean): DeckSlide[] {
  const slides = project.note ? noteSlides({ ...project.note, title: project.title }, options, withTitle) : withTitle ? [titleSlide(project.title, null)] : [];
  if (project.canvas) slides.push(...canvasSlides(project.canvas));
  return slides;
}

/** One slide per frame or figure, zoomed to it; the whole canvas when it has neither. */
function canvasSlides(canvas: CanvasSource): DeckSlide[] {
  const refs = canvas.slides.length ? canvas.slides : [{ itemId: null, title: canvas.title }];
  return refs.map((ref) =>
    newSlide("canvas", {
      main: ref.title ? [heading(ref.title, 2)] : [],
      canvas: { canvasId: canvas.canvasId, itemId: ref.itemId },
    }),
  );
}

function titleSlide(title: string, subtitle: string | null): DeckSlide {
  return newSlide("title", { main: [heading(title || "Untitled", 1), ...(subtitle ? [paragraph(subtitle)] : [])] });
}

interface Section {
  heading: NoteBlock | null;
  body: NoteBlock[];
}

function noteSlides(note: NoteSource, options: ConvertOptions, withTitle: boolean): DeckSlide[] {
  const sections = splitSections(note.blocks.filter((b) => !isEmptyParagraph(b)), options.split);
  // A short opening paragraph before the first section is the title slide's subtitle.
  let subtitle: string | null = null;
  const intro = sections[0];
  if (withTitle && intro && !intro.heading) {
    const first = intro.body[0];
    if (first?.type === "paragraph" && blockText(first).length <= LEAD_MAX_CHARS) {
      subtitle = blockText(first).trim();
      intro.body.shift();
    }
  }
  const slides = withTitle ? [titleSlide(note.title, subtitle)] : [];
  for (const section of sections) slides.push(...sectionSlides(section, options));
  return slides;
}

function splitSections(blocks: NoteBlock[], split: SplitMode): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: null, body: [] };
  const flush = () => {
    if (current.heading || current.body.length) sections.push(current);
  };
  for (const block of blocks) {
    if (split === "divider") {
      if (block.type === "divider") {
        flush();
        current = { heading: null, body: [] };
      } else if (!current.heading && !current.body.length && block.type === "heading") current.heading = block;
      else current.body.push(block);
    } else if (block.type === "heading" && (block.props?.level ?? 1) <= 2) {
      flush();
      current = { heading: block, body: [] };
    } else if (block.type !== "divider") current.body.push(block);
  }
  flush();
  return sections;
}

/** The title block a slide shows: the section heading as an H2 (keeping its id, so it morphs between continued slides). */
function slideHeading(h: NoteBlock | null): NoteBlock[] {
  return h ? [{ ...h, props: { ...h.props, level: 2 } }] : [];
}

function sectionSlides(section: Section, options: ConvertOptions): DeckSlide[] {
  const title = slideHeading(section.heading);
  const media = section.body.filter(isMediaBlock);
  const text = section.body.filter((b) => !isMediaBlock(b));
  const notes: string[] = [];
  let kept = text;
  if (options.textToNotes) {
    kept = text.filter((b) => POINT_TYPES.has(b.type));
    const paragraphs = text.filter((b) => !POINT_TYPES.has(b.type));
    // A slide with no points and no block keeps its short lead paragraph.
    const lead = !kept.length && !media.length ? paragraphs.find((p) => blockText(p).length <= LEAD_MAX_CHARS) : undefined;
    if (lead) kept = [lead];
    for (const p of paragraphs) if (p !== lead && blockText(p).trim()) notes.push(blockText(p).trim());
  }
  const notesText = notes.join("\n\n");

  if (!kept.length && !media.length) {
    return title.length ? [newSlide("section", { main: section.heading ? [{ ...section.heading, props: { ...section.heading.props, level: 1 } }] : [], notes: notesText })] : [];
  }

  // Long text continues on more slides under the same heading.
  const textChunks: NoteBlock[][] = [];
  for (let i = 0; i < kept.length; i += TEXT_PER_SLIDE) textChunks.push(kept.slice(i, i + TEXT_PER_SLIDE));
  const mediaGroups = options.onePerSlide ? media.map((m) => [m]) : media.length ? [media] : [];

  const slides: DeckSlide[] = [];
  const firstText = textChunks.shift() ?? [];
  const firstMedia = mediaGroups.shift();
  if (firstMedia && firstText.length) slides.push(newSlide("split", { main: [...title, ...firstText], side: firstMedia }));
  else if (firstMedia) slides.push(newSlide("media", { main: [...title, ...firstMedia] }));
  else slides.push(newSlide("content", { main: [...title, ...firstText] }));
  for (const chunk of textChunks) slides.push(newSlide("content", { main: [...title, ...chunk] }));
  for (const group of mediaGroups) slides.push(newSlide("media", { main: [...title, ...group] }));
  slides[0]!.notes = notesText;
  return slides;
}

/** One slide written in markdown, before its blocks are parsed. */
export interface SlideMarkdown {
  markdown: string;
  notes: string;
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Slide markdown, the format reveal.js and Remark use: slides are separated
 * by a line of `---`, and anything after a line of `???` on a slide is its
 * presenter notes. Fenced code (and the blocks written as fences: quizzes,
 * mermaid…) is never split.
 */
export function splitSlideMarkdown(markdown: string): SlideMarkdown[] {
  const slides: SlideMarkdown[] = [];
  let body: string[] = [];
  let notes: string[] | null = null;
  let fence: string | null = null;
  const flush = () => {
    const md = body.join("\n").trim();
    const n = (notes ?? []).join("\n").trim();
    if (md || n) slides.push({ markdown: md, notes: n });
    body = [];
    notes = null;
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const f = line.match(FENCE)?.[1];
    if (f && (!fence || f[0] === fence[0])) fence = fence ? null : f;
    if (!fence && /^---\s*$/.test(line)) flush();
    else if (!fence && notes === null && /^\?\?\?\s*$/.test(line)) notes = [];
    else (notes ?? body).push(line);
  }
  flush();
  return slides;
}

/**
 * Slides already split (slide markdown, parsed) → a deck. Each slide's
 * layout follows its content: a lone heading is the title (first) or a
 * section; text with a block is text-and-block; a block alone fills the
 * slide; anything else is text. Nothing moves to the notes.
 */
export function deckFromSlides(slides: { blocks: NoteBlock[]; notes: string }[]): DeckDocument {
  return deckOf(
    slides.map(({ blocks: raw, notes }, i) => {
      const blocks = raw.filter((b) => !isEmptyParagraph(b));
      const media = blocks.filter(isMediaBlock);
      const text = blocks.filter((b) => !isMediaBlock(b));
      const head = text[0]?.type === "heading" ? text[0] : null;
      const rest = head ? text.slice(1) : text;
      const short = rest.length <= 1 && rest.every((b) => b.type === "paragraph" && blockText(b).length <= LEAD_MAX_CHARS);
      if (!media.length && head && short) return newSlide(i === 0 ? "title" : "section", { main: blocks, notes });
      if (media.length && rest.length) return newSlide("split", { main: text, side: media, notes });
      if (media.length) return newSlide("media", { main: [...text, ...media], notes });
      return newSlide("content", { main: blocks, notes });
    }),
  );
}
