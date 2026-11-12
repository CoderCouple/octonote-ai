import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { CanvasReferenceBlock } from "../blocks/canvas-reference-block";
import { FigureBlock } from "../blocks/figure-block";
import { InteractiveBlock } from "../blocks/interactive-block";
import { ManimVideoBlock } from "../blocks/manim-video-block";
import { MathBlock, MathInline } from "../blocks/math";
import { MermaidBlock } from "../blocks/mermaid-block";
import { octoCodeBlockOptions } from "./code-highlighter";

/**
 * The one BlockNote schema for every surface that parses or renders a note
 * (editor, read-only viewer, published page). Never inline `blockSpecs`
 * elsewhere — a renderer missing a block white-screens on notes that use it.
 */
export const octoBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    // Syntax highlighting (Shiki, GitHub light/dark), with a language picker.
    codeBlock: createCodeBlockSpec(octoCodeBlockOptions),
    canvasReference: CanvasReferenceBlock(),
    figure: FigureBlock(),
    mathBlock: MathBlock(),
    mermaid: MermaidBlock(),
    // Widgets, activities, animations and sandboxed apps from a validated JSON spec.
    interactive: InteractiveBlock(),
    // Manim explainer videos, by id; the video itself lives in storage.
    manimVideo: ManimVideoBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    math: MathInline,
  },
});

export type OctoBlockNoteSchema = typeof octoBlockNoteSchema;
