/**
 * The stored canvas `document` is an octodraw CanvasDocument
 * (`{ version: 1, items, comments?, presentation? }`, plain JSON); anything
 * else loads as an empty canvas.
 */
import { toOctodrawDocument } from "@octonote/content";
import type { CanvasDocument } from "@octonote/octodraw";

export function toCanvasDocument(value: unknown): CanvasDocument {
  return toOctodrawDocument(value) as CanvasDocument;
}
