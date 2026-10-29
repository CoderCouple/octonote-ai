/**
 * Which canvas format a stored `canvases.document` is in, and the octodraw
 * document for either. Canvases saved before octodraw are tldraw snapshots;
 * readers call `toOctodrawDocument` and never care which one they got.
 */
import { emptyOctodrawDocument, type CanvasDocument } from "./octodraw-types";
import { isTldrawDocument, tldrawToOctodraw } from "./tldraw-to-octodraw";

/** A loose check that a value is an octodraw canvas document (same as octodraw's `isCanvasDocument`). */
export function isOctodrawDocument(value: unknown): value is CanvasDocument {
  return (
    !!value &&
    typeof value === "object" &&
    (value as CanvasDocument).version === 1 &&
    Array.isArray((value as CanvasDocument).items)
  );
}

/** The octodraw document for a stored canvas in either format; an empty one for null or anything unreadable. */
export function toOctodrawDocument(value: unknown): CanvasDocument {
  if (isOctodrawDocument(value)) return value;
  if (isTldrawDocument(value)) return tldrawToOctodraw(value);
  return emptyOctodrawDocument();
}
