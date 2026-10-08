import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { CanvasReferenceBlock } from "../blocks/canvas-reference-block";

/**
 * The one BlockNote schema for every surface that parses or renders a note
 * (editor, read-only viewer, published page). Never inline `blockSpecs`
 * elsewhere — a renderer missing a block white-screens on notes that use it.
 */
export const octoBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    canvasReference: CanvasReferenceBlock(),
  },
});

export type OctoBlockNoteSchema = typeof octoBlockNoteSchema;
