import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { CanvasReferenceBlock } from "../blocks/canvas-reference-block";
import { FigureBlock } from "../blocks/figure-block";
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
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    math: MathInline,
  },
});

export type OctoBlockNoteSchema = typeof octoBlockNoteSchema;
