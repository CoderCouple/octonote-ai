/**
 * Server-side markdown ⇄ note conversion (API, scripts, tests), using
 * BlockNote's own parser and serializer — the same ones the editor uses —
 * so documents built here load in the editor exactly like pasted markdown.
 */
import type { ServerBlockNoteEditor } from "@blocknote/server-util";
import { toStandardBlocks } from "./notes/blocks-to-markdown";
import { markdownToBlocks } from "./notes/markdown-to-blocks";
import type { NoteBlock, NoteDocument } from "./notes/types";

export * from "./index";

/**
 * BlockNote's CommonJS build doesn't load in Node (a bundled dependency's
 * default export breaks), so load its ES module build with a real dynamic
 * import — written so TypeScript's CommonJS output can't turn it into require().
 */
const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<typeof import("@blocknote/server-util")>;

let editor: Promise<ServerBlockNoteEditor> | null = null;
// One editor per process: creating it builds a schema and a DOM shim.
function serverEditor() {
  editor ??= importEsm("@blocknote/server-util")
    // Inside a test runner's module sandbox that native import isn't allowed,
    // but a plain import() there stays a real ES import.
    .catch(() => import("@blocknote/server-util"))
    .then((m) => m.ServerBlockNoteEditor.create());
  return editor;
}

/** Markdown → the document a note stores (`{ blocks }`). */
export async function markdownToNoteDocument(markdown: string): Promise<NoteDocument> {
  const parser = await serverEditor();
  const blocks = await markdownToBlocks(
    markdown,
    (md) => parser.tryParseMarkdownToBlocks(md) as Promise<NoteBlock[]>,
  );
  return { blocks };
}

/** A note's stored document → markdown (lossy for layout, keeps content). */
export async function noteDocumentToMarkdown(document: unknown): Promise<string> {
  const blocks =
    document && typeof document === "object" && Array.isArray((document as NoteDocument).blocks)
      ? (document as NoteDocument).blocks
      : [];
  if (blocks.length === 0) return "";
  return (await serverEditor()).blocksToMarkdownLossy(toStandardBlocks(blocks) as never);
}

/**
 * A note's stored document → HTML for previews (assistant app cards). Lossy
 * like the markdown export: Octonote's own blocks become standard ones
 * (a mermaid diagram becomes a code block with language "mermaid").
 */
export async function noteDocumentToHtml(document: unknown): Promise<string> {
  const blocks =
    document && typeof document === "object" && Array.isArray((document as NoteDocument).blocks)
      ? (document as NoteDocument).blocks
      : [];
  if (blocks.length === 0) return "";
  return (await serverEditor()).blocksToHTMLLossy(toStandardBlocks(blocks) as never);
}

/** Where a top-level block sits, for anchoring: its id, or `i:<index>` if it has none yet. */
export function blockAnchor(block: NoteBlock, index: number): string {
  return typeof block?.id === "string" && block.id ? block.id : `i:${index}`;
}

/**
 * Like noteDocumentToHtml, but each top-level block is wrapped in
 * `<div data-b="<anchor>">` (see blockAnchor) so a preview can tell which
 * blocks a reader selected. Numbered lists keep counting across blocks.
 */
export async function noteDocumentToAnchoredHtml(document: unknown): Promise<string> {
  const blocks =
    document && typeof document === "object" && Array.isArray((document as NoteDocument).blocks)
      ? (document as NoteDocument).blocks
      : [];
  const editor = await serverEditor();
  let run = 0;
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    run = block.type === "numberedListItem" ? run + 1 : 0;
    let html = await editor.blocksToHTMLLossy(toStandardBlocks([block]) as never);
    if (run > 1) html = html.replace(/^<ol>/, `<ol start="${run}">`);
    out.push(`<div data-b="${blockAnchor(block, i).replace(/"/g, "")}">${html}</div>`);
  }
  return out.join("");
}
