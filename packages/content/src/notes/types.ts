/**
 * Loosely-typed BlockNote block JSON. The editor validates documents when it
 * loads them; this package only needs to read and build the shapes.
 */
export type NoteBlock = Record<string, any>;

/** A note's stored document: `{ blocks }` (what pages.document holds). */
export interface NoteDocument {
  blocks: NoteBlock[];
}

/** Any BlockNote markdown parser: the browser editor's or the server editor's. */
export type ParseMarkdown = (markdown: string) => NoteBlock[] | Promise<NoteBlock[]>;
