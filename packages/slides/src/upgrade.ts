/**
 * Version-1 decks (fixed layouts) → version 2 (positioned objects). Each
 * layout's regions become text boxes and blocks placed where the layout drew
 * them, and click-by-click builds become entrance animations, so an
 * upgraded deck looks and plays as it did.
 */
import { blockText, isMediaBlock, type NoteBlock } from "./blocks.js";
import type { LegacyDeck, LegacySlide } from "./legacy.js";
import {
  animationId,
  DECK_VERSION,
  elementId,
  SLIDE_SIZE,
  type DeckAspect,
  type DeckDocument,
  type DeckSlide,
  type SlideAnimation,
  type SlideElement,
  type TextElement,
} from "./model.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The version-1 slide padding and gap (styles.css), in slide units. */
const PAD = { x: 64, y: 48 };
const GAP = 36;
const STACK_GAP = 16;
const BASE = 19;

/** Rough height of a text block at the slide's base size (the box still grows or shrinks to fit). */
function textHeight(block: NoteBlock, width: number): number {
  if (block.type === "heading") return ({ 1: 72, 2: 52, 3: 38 } as Record<number, number>)[Number(block.props?.level) || 2] ?? 52;
  if (block.type === "mathBlock") return 70;
  if (block.type === "codeBlock") return 24 + blockText(block).split("\n").length * 22;
  const chars = Math.max(1, blockText(block).length);
  const perLine = Math.max(10, width / (BASE * 0.5));
  return Math.ceil(chars / perLine) * BASE * 1.4 + 8;
}

const stackHeight = (blocks: NoteBlock[], width: number) => blocks.reduce((h, b) => h + textHeight(b, width), 0) + Math.max(0, blocks.length - 1) * 8;

/**
 * A region's blocks as objects stacked top to bottom: runs of text become
 * text boxes, each media block a block of its own; media share the room the
 * text leaves.
 */
function stack(blocks: NoteBlock[], region: Box, firstIsTitle: boolean): SlideElement[] {
  if (!blocks.length) return [];
  if (!blocks.some(isMediaBlock)) return [textBox(blocks, region, firstIsTitle && blocks[0]?.type === "heading")];
  const parts: (NoteBlock[] | NoteBlock)[] = [];
  for (const b of blocks) {
    if (isMediaBlock(b)) parts.push(b);
    else if (Array.isArray(parts.at(-1))) (parts.at(-1) as NoteBlock[]).push(b);
    else parts.push([b]);
  }
  const textRoom = parts.reduce((h, p) => h + (Array.isArray(p) ? stackHeight(p, region.w) : 0), 0);
  const media = parts.filter((p) => !Array.isArray(p)).length;
  const gaps = (parts.length - 1) * STACK_GAP;
  const mediaH = Math.max(80, (region.h - textRoom - gaps) / media);
  // When it all doesn't fit, everything shrinks in proportion (blocks still shrink to fit their box).
  const total = textRoom + mediaH * media + gaps;
  const k = total > region.h ? region.h / total : 1;
  let y = region.y;
  return parts.map((p, i) => {
    const h = (Array.isArray(p) ? stackHeight(p, region.w) : mediaH) * k;
    const box = { x: region.x, y, w: region.w, h };
    y += h + STACK_GAP * k;
    return Array.isArray(p) ? textBox(p, box, firstIsTitle && i === 0 && p[0]?.type === "heading") : { id: elementId(), kind: "block" as const, ...box, blocks: [p] };
  });
}

function textBox(blocks: NoteBlock[], box: Box, title: boolean, extra: Partial<TextElement> = {}): TextElement {
  return { id: elementId(), kind: "text", ...box, blocks, ...(title ? { role: "title" as const } : {}), ...extra };
}

export function upgradeSlide(slide: LegacySlide, aspect: DeckAspect): DeckSlide {
  const { w: W, h: H } = SLIDE_SIZE[aspect];
  const content: Box = { x: PAD.x, y: PAD.y, w: W - PAD.x * 2, h: H - PAD.y * 2 };
  let elements: SlideElement[] = [];
  let background: string | undefined;
  switch (slide.layout) {
    case "title":
      elements = [textBox(slide.main, { x: 80, y: PAD.y, w: W - 160, h: content.h }, true, { style: { vAlign: "middle" } })];
      break;
    case "section":
      elements = [textBox(slide.main, content, true, { style: { vAlign: "middle" } })];
      background = "surface";
      break;
    case "split": {
      const left = (content.w - GAP) / 2.15;
      elements = [
        ...stack(slide.main, { ...content, w: left }, true),
        ...stack(slide.side, { x: content.x + left + GAP, y: content.y, w: content.w - left - GAP, h: content.h }, false),
      ];
      break;
    }
    case "canvas": {
      if (slide.canvas) elements.push({ id: elementId(), kind: "canvas", x: 0, y: 0, w: W, h: H, canvasId: slide.canvas.canvasId, itemId: slide.canvas.itemId });
      if (slide.main.length)
        elements.push(textBox(slide.main, { x: 24, y: 20, w: Math.round(W * 0.6), h: 64 }, true, { style: { fill: "bg", radius: 9, padding: 12, fontScale: 0.8 } }));
      break;
    }
    case "blank":
      elements = stack(slide.main, { x: 32, y: 32, w: W - 64, h: H - 64 }, true);
      break;
    default:
      // content and media: the region stacked top to bottom.
      elements = stack(slide.main, content, true);
  }
  const animations: SlideAnimation[] = (slide.builds ?? []).flatMap((build) => {
    const el = elements.find((e) => "blocks" in e && e.blocks.some((b) => b.id === build.blockId));
    if (!el || !("blocks" in el)) return [];
    // A build on the only block of an object animates the object; inside a text box, the paragraph.
    const whole = el.blocks.length === 1;
    const emphasis = build.effect === "highlight";
    return [
      {
        id: animationId(),
        elementId: el.id,
        ...(whole ? {} : { blockId: build.blockId }),
        type: emphasis ? "emphasis" : "in",
        effect: emphasis ? "highlight" : build.effect,
        trigger: "click",
        duration: 450,
        delay: 0,
      },
    ];
  });
  return {
    id: slide.id,
    elements,
    animations,
    notes: slide.notes,
    ...(background ? { background } : {}),
    ...(slide.transition ? { transition: slide.transition } : {}),
    ...(slide.hidden ? { hidden: true } : {}),
  };
}

export function upgradeDeck(deck: LegacyDeck): DeckDocument {
  return {
    version: DECK_VERSION,
    theme: deck.theme,
    aspect: deck.aspect,
    transition: deck.transition,
    slides: deck.slides.map((s) => upgradeSlide(s, deck.aspect)),
    ...(deck.canvases ? { canvases: deck.canvases } : {}),
  };
}
