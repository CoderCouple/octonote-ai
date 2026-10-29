/**
 * Canvas documents during the tldraw → octodraw switch.
 *
 * `canvases.document` holds an octodraw `CanvasDocument` (`{ version: 1,
 * items }`) once a row is converted (`document_format = 'octodraw'`), and the
 * original tldraw store snapshot until then. Every API path that hands a
 * canvas document out goes through `readCanvasDocument`, so clients only ever
 * see octodraw, whether or not `db:convert-canvases` has run yet. Writes go
 * through `canvasDocumentWrite`: tldraw documents from older clients are
 * converted, and the first tldraw version of a canvas is kept in
 * `document_tldraw` as a backup.
 */
import {
  emptyOctodrawDocument,
  isOctodrawDocument,
  isTldrawDocument,
  toOctodrawDocument,
  type OctodrawDocument,
} from "@octonote/content/server";

export type { OctodrawDocument };
export type CanvasDocumentFormat = "tldraw" | "octodraw";

/** An empty octodraw canvas — what new canvases start with. */
export const emptyCanvasDocument = (): OctodrawDocument => emptyOctodrawDocument();

/**
 * The document a canvas row stores, as octodraw. Converts on the fly when the
 * row is still tldraw; a document that can't be read comes back empty (the
 * original stays in the row, and a later save backs it up first).
 */
export function readCanvasDocument(row: { id?: string; document: unknown; documentFormat?: string | null }): OctodrawDocument {
  if (isOctodrawDocument(row.document)) return row.document;
  try {
    return toOctodrawDocument(row.document);
  } catch (err) {
    console.warn(`Canvas ${row.id ?? "?"}: couldn't convert its document to octodraw:`, err);
    return emptyCanvasDocument();
  }
}

/**
 * The columns to write for a new canvas document. `existing` is the row as
 * stored now (for the backup): its tldraw document is kept in
 * `document_tldraw` unless a backup is already there; otherwise an incoming
 * tldraw document (an old client) is kept.
 */
export function canvasDocumentWrite(
  incoming: unknown,
  existing?: { document: unknown; documentFormat?: string | null; documentTldraw?: unknown } | null,
): { document: OctodrawDocument; documentFormat: "octodraw"; documentTldraw?: unknown } {
  const document = toOctodrawDocument(incoming);
  const out: { document: OctodrawDocument; documentFormat: "octodraw"; documentTldraw?: unknown } = {
    document,
    documentFormat: "octodraw",
  };
  const hasBackup = existing?.documentTldraw !== null && existing?.documentTldraw !== undefined;
  if (!hasBackup) {
    if (existing && existing.documentFormat !== "octodraw" && isTldrawDocument(existing.document)) {
      out.documentTldraw = existing.document;
    } else if (isTldrawDocument(incoming)) {
      out.documentTldraw = incoming;
    }
  }
  return out;
}
