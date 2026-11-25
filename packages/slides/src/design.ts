/**
 * "Let AI design it": a model plans the slides, this builds them. The model
 * reads a brief (the source's text, and a numbered list of its blocks and
 * canvas parts) and answers with a plan in DESIGN_SCHEMA: each slide's layout,
 * title, a few short points, which blocks go on it, and what to say. The
 * deck is then built here, so the source's blocks are reused exactly as they
 * are (never rewritten by the model), refs it invents are ignored, and any
 * block it leaves out still gets a slide: nothing the author made is lost.
 */
import { blockText, DECK_VERSION, heading, newSlide, paragraph, type DeckDocument, type DeckSlide, type NoteBlock } from "./model.js";
import { isMediaBlock, type CanvasSource } from "./convert.js";

/** What the model may use: notes with their blocks, and canvases with their parts. */
export type DesignItem = { kind: "note"; title: string; blocks: NoteBlock[] } | { kind: "canvas"; title: string; canvas: CanvasSource };

export interface DesignBrief {
  title: string;
  /** What the model reads. */
  text: string;
  /** B1, B2… → a block; C1, C2… → a canvas part. */
  refs: Map<string, { block: NoteBlock } | { canvas: CanvasSource; itemId: string | null; title: string }>;
  canvases: CanvasSource[];
}

export const DESIGN_LIMITS = { slides: 60, points: 6, pointChars: 140, titleChars: 90, notesChars: 2000, briefChars: 60_000 } as const;

const DESIGN_LAYOUTS = ["title", "section", "content", "split", "media", "canvas"] as const;
type DesignLayout = (typeof DESIGN_LAYOUTS)[number];

export interface SlideDesign {
  layout: DesignLayout;
  title: string;
  points?: string[];
  refs?: string[];
  notes?: string;
}

/** The tool the model answers with (JSON Schema). */
export const DESIGN_SCHEMA = {
  type: "object",
  required: ["slides"],
  properties: {
    slides: {
      type: "array",
      minItems: 1,
      maxItems: DESIGN_LIMITS.slides,
      items: {
        type: "object",
        required: ["layout", "title"],
        properties: {
          layout: {
            type: "string",
            enum: [...DESIGN_LAYOUTS],
            description:
              "title: the opening slide · section: a divider between parts · content: points only · split: points left, one block right · media: one block filling the slide · canvas: one canvas part (C ref) filling the slide",
          },
          title: { type: "string", maxLength: DESIGN_LIMITS.titleChars, description: "Short and specific, like a headline. The talk's title on the title slide." },
          points: {
            type: "array",
            maxItems: DESIGN_LIMITS.points,
            items: { type: "string", maxLength: DESIGN_LIMITS.pointChars },
            description: "What the audience reads: a few short points, not sentences from the source. For a title slide, one subtitle line.",
          },
          refs: { type: "array", maxItems: 1, items: { type: "string", pattern: "^[BC][0-9]+$" }, description: "The block (B…) or canvas part (C…) this slide shows, from the brief." },
          notes: { type: "string", maxLength: DESIGN_LIMITS.notesChars, description: "What the presenter says on this slide, in full sentences, from the source." },
        },
      },
    },
  },
} as const;

export const DESIGN_SYSTEM = `You design presentation slides from a source the person wrote (a note, a project or a notebook). Plan the slides for a clear, engaging talk:
- Start with a title slide (the talk's title, one subtitle line). Use section slides between major parts.
- One idea per slide. Points are short (a few words to one line), at most ${DESIGN_LIMITS.points}; never paste paragraphs onto a slide.
- Put every block (B…) on its own slide: split when a few points explain it, media when it should fill the slide. Put canvas parts (C…) on canvas slides. Use each ref once.
- Write the presenter notes from the source: what to say, the explanation and examples the points leave out.
- Use only what the source says, in its language. Keep the source's order unless another order clearly teaches better.`;

/** A block as one line of the brief. */
function describe(block: NoteBlock): string {
  const t = blockText(block).trim();
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Math.min(3, Number(block.props?.level) || 2) + 1)} ${t}`;
    case "bulletListItem":
    case "checkListItem":
    case "toggleListItem":
      return `- ${t}`;
    case "numberedListItem":
      return `1. ${t}`;
    case "quote":
      return `> ${t}`;
    case "mathBlock":
      return `$$${String(block.props?.latex ?? t)}$$`;
    case "codeBlock":
      return "```\n" + t + "\n```";
    default:
      return t;
  }
}

function blockLabel(block: NoteBlock): string {
  if (block.type === "interactive") {
    let title = "";
    try {
      const spec = typeof block.props?.spec === "string" ? JSON.parse(block.props.spec) : block.props?.spec;
      title = typeof spec?.title === "string" ? spec.title : "";
    } catch {
      /* a label without the title is fine */
    }
    return `${block.props?.kind ?? "block"}${title ? ` "${title}"` : ""}`;
  }
  if (block.type === "manimVideo") return "explainer video";
  if (block.type === "mermaid") return "diagram";
  return block.type;
}

/** The brief the model reads, and the refs its plan may use. */
export function designBrief(title: string, items: DesignItem[]): DesignBrief {
  const refs: DesignBrief["refs"] = new Map();
  const canvases: CanvasSource[] = [];
  const lines: string[] = [`# ${title}`];
  for (const item of items) {
    if (items.length > 1) lines.push("", `## ${item.title || "Untitled"}`);
    if (item.kind === "canvas") {
      canvases.push(item.canvas);
      const parts = item.canvas.slides.length ? item.canvas.slides : [{ itemId: null, title: item.canvas.title }];
      for (const part of parts) {
        const ref = `C${refs.size + 1}`;
        refs.set(ref, { canvas: item.canvas, itemId: part.itemId, title: part.title || item.canvas.title });
        lines.push(`[${ref}: canvas ${part.itemId ? "part" : "drawing"} "${part.title || item.canvas.title}"]`);
      }
      continue;
    }
    for (const block of item.blocks) {
      if (isMediaBlock(block)) {
        const ref = `B${refs.size + 1}`;
        refs.set(ref, { block });
        lines.push(`[${ref}: ${blockLabel(block)}]`);
      } else {
        const line = describe(block);
        if (line.trim()) lines.push(line);
      }
    }
  }
  let text = lines.join("\n");
  if (text.length > DESIGN_LIMITS.briefChars) text = `${text.slice(0, DESIGN_LIMITS.briefChars)}\n[…the rest is cut for length]`;
  return { title, text, refs, canvases };
}

const bullet = (text: string): NoteBlock => ({ ...paragraph(text), type: "bulletListItem" });
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/**
 * The model's plan → a deck. Never trusts the plan's shape: unknown layouts,
 * refs and extra fields are ignored, and layouts are corrected to what the
 * slide actually holds.
 */
export function deckFromDesign(plan: unknown, brief: DesignBrief): DeckDocument {
  const raw = Array.isArray((plan as { slides?: unknown } | null)?.slides) ? (plan as { slides: unknown[] }).slides.slice(0, DESIGN_LIMITS.slides) : [];
  const used = new Set<string>();
  const slides: DeckSlide[] = [];
  const shownCanvases = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const s = entry as Record<string, unknown>;
    const title = clip(s.title, DESIGN_LIMITS.titleChars);
    const points = (Array.isArray(s.points) ? s.points : []).map((p) => clip(p, DESIGN_LIMITS.pointChars)).filter(Boolean).slice(0, DESIGN_LIMITS.points);
    const notes = clip(s.notes, DESIGN_LIMITS.notesChars);
    const ref = (Array.isArray(s.refs) ? s.refs : []).map(String).find((r) => brief.refs.has(r) && !used.has(r));
    const target = ref ? brief.refs.get(ref)! : null;
    if (ref) used.add(ref);
    const layout = DESIGN_LAYOUTS.includes(s.layout as DesignLayout) ? (s.layout as DesignLayout) : "content";

    if (target && "canvas" in target) {
      shownCanvases.add(target.canvas.canvasId);
      slides.push(newSlide("canvas", { main: [heading(title || target.title, 2)], canvas: { canvasId: target.canvas.canvasId, itemId: target.itemId }, notes }));
      continue;
    }
    const block = target && "block" in target ? target.block : null;
    if ((layout === "title" || layout === "section") && !block) {
      // Only the first slide is the title slide; a later "title" is a section.
      slides.push(newSlide(slides.length === 0 && layout === "title" ? "title" : "section", { main: [heading(title, 1), ...(points[0] ? [paragraph(points[0])] : [])], notes }));
      continue;
    }
    const head = title ? [heading(title, 2)] : [];
    if (block && points.length) slides.push(newSlide("split", { main: [...head, ...points.map(bullet)], side: [block], notes }));
    else if (block) slides.push(newSlide("media", { main: [...head, block], notes }));
    else slides.push(newSlide("content", { main: [...head, ...points.map(bullet)], notes }));
  }
  if (!slides.length) slides.push(newSlide("title", { main: [heading(brief.title || "Untitled", 1)] }));
  // Blocks the plan left out still get a slide: the author made them for a reason.
  for (const [ref, target] of brief.refs) {
    if (used.has(ref)) continue;
    if ("block" in target) slides.push(newSlide("media", { main: [target.block] }));
    else {
      shownCanvases.add(target.canvas.canvasId);
      slides.push(newSlide("canvas", { main: [heading(target.title, 2)], canvas: { canvasId: target.canvas.canvasId, itemId: target.itemId } }));
    }
  }
  const copies = Object.fromEntries(brief.canvases.filter((c) => shownCanvases.has(c.canvasId)).map((c) => [c.canvasId, c.document]));
  return {
    version: DECK_VERSION,
    theme: "paper",
    aspect: "16:9",
    transition: "fade",
    slides,
    ...(Object.keys(copies).length ? { canvases: copies } : {}),
  };
}
