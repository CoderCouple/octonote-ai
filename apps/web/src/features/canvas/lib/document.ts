/**
 * The stored canvas `document` is an octodraw CanvasDocument
 * (`{ version: 1, items, comments?, presentation? }`, plain JSON). Canvases
 * saved before octodraw hold tldraw snapshots; @octonote/content converts
 * them on load, and the next save stores the octodraw document.
 */
import { toOctodrawDocument } from "@octonote/content";
import type { CanvasDocument } from "@octonote/octodraw";

export function toCanvasDocument(value: unknown): CanvasDocument {
  return toOctodrawDocument(value) as CanvasDocument;
}
