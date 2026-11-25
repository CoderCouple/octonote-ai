import { blockElement, elementId, heading, paragraph, SLIDE_SIZE, type DeckAspect, type NoteBlock, type ShapeName, type SlideElement } from "@octonote/slides";
import { starterSpec } from "@/features/notes/blocks/interactive-block";

/** A box centred on the slide. */
function centred(aspect: DeckAspect, w: number, h: number) {
  const s = SLIDE_SIZE[aspect];
  return { x: Math.round((s.w - w) / 2), y: Math.round((s.h - h) / 2), w, h };
}

export function newTextBox(aspect: DeckAspect, kind: "title" | "text" = "text"): SlideElement {
  const blocks = kind === "title" ? [heading("Title", 2)] : [paragraph("Text")];
  return { id: elementId(), kind: "text", ...centred(aspect, kind === "title" ? 600 : 400, kind === "title" ? 80 : 120), blocks, ...(kind === "title" ? { role: "title" as const } : {}) };
}

/** Blocks that can be inserted as an object of their own. */
export const INSERTABLE_BLOCKS = ["quiz", "mcq", "flashcards", "mindmap", "matching", "widget", "infographic", "scene", "custom", "mermaid", "equation", "code"] as const;
export type InsertableBlock = (typeof INSERTABLE_BLOCKS)[number] | "video";

const id = () => globalThis.crypto.randomUUID();

export function blockFor(kind: Exclude<InsertableBlock, "video">): NoteBlock {
  if (kind === "mermaid") return { id: id(), type: "mermaid", props: { code: "graph LR\n  A[Idea] --> B[Slide]" }, children: [] };
  if (kind === "equation") return { id: id(), type: "mathBlock", props: { latex: "E = mc^2" }, children: [] };
  if (kind === "code") return { id: id(), type: "codeBlock", props: { language: "python" }, content: [{ type: "text", text: "print('hello')", styles: {} }], children: [] };
  return { id: id(), type: "interactive", props: { kind, spec: starterSpec(kind) }, children: [] };
}

export function newBlockObject(aspect: DeckAspect, block: NoteBlock): SlideElement {
  const small = block.type === "mathBlock" || block.type === "codeBlock";
  return blockElement(block, centred(aspect, small ? 480 : 640, small ? 140 : 380));
}

export function newVideoObject(aspect: DeckAspect, videoId: string): SlideElement {
  return blockElement({ id: id(), type: "manimVideo", props: { videoId }, children: [] }, centred(aspect, 640, 380));
}

export function newShape(aspect: DeckAspect, shape: ShapeName): SlideElement {
  const line = shape === "line";
  return { id: elementId(), kind: "shape", shape, ...centred(aspect, line ? 300 : 200, line ? 20 : 140) };
}

export function newImage(aspect: DeckAspect, src: string, natural?: { w: number; h: number }): SlideElement {
  const s = SLIDE_SIZE[aspect];
  // Fit in two-thirds of the slide, keeping the picture's shape.
  const ratio = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : 4 / 3;
  let w = s.w * 0.6;
  let h = w / ratio;
  if (h > s.h * 0.66) {
    h = s.h * 0.66;
    w = h * ratio;
  }
  return { id: elementId(), kind: "image", src, fit: "contain", ...centred(aspect, Math.round(w), Math.round(h)) };
}
