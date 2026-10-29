/** Checks for a stored `canvases.document`, which is always an octodraw document. */
import { emptyOctodrawDocument, type CanvasDocument } from "./octodraw-types";

/** A loose check that a value is an octodraw canvas document (same as octodraw's `isCanvasDocument`). */
export function isOctodrawDocument(value: unknown): value is CanvasDocument {
  return (
    !!value &&
    typeof value === "object" &&
    (value as CanvasDocument).version === 1 &&
    Array.isArray((value as CanvasDocument).items)
  );
}

/** The value if it is an octodraw document, else an empty one (null or anything unreadable). */
export function toOctodrawDocument(value: unknown): CanvasDocument {
  return isOctodrawDocument(value) ? value : emptyOctodrawDocument();
}
