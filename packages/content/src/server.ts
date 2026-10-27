/**
 * Server-side markdown ⇄ note conversion (API, scripts, tests), using
 * BlockNote's own parser and serializer — the same ones the editor uses —
 * so documents built here load in the editor exactly like pasted markdown.
 */
import type { ServerBlockNoteEditor } from "@blocknote/server-util";
import { toStandardBlocks } from "./notes/blocks-to-markdown";
import { flowchartToCanvas } from "./canvas/flowchart-to-canvas";
import { isClassDiagram, parseMermaidClassDiagram } from "./canvas/mermaid-class";
import { parseMermaidFlowchart } from "./canvas/mermaid-flowchart";
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

export { MermaidParseError, parseMermaidFlowchart, type Flowchart } from "./canvas/mermaid-flowchart";
export { flowchartToCanvas } from "./canvas/flowchart-to-canvas";

export { isClassDiagram, parseMermaidClassDiagram } from "./canvas/mermaid-class";
export { parseLinkLine, safeUrl } from "./canvas/mermaid-links";

/** A mermaid flowchart or class diagram → a canvas document (tldraw snapshot), laid out. */
export function mermaidToCanvasDocument(source: string) {
  return flowchartToCanvas(
    isClassDiagram(source) ? parseMermaidClassDiagram(source) : parseMermaidFlowchart(source),
  );
}
