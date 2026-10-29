/**
 * @octonote/content — Octonote's content formats, free of app and API code.
 * Pure functions only here; the server-side BlockNote parser lives in
 * `@octonote/content/server` so browsers never load it.
 */
export type { NoteBlock, NoteDocument, ParseMarkdown } from "./notes/types";
export {
  hasMarkdownExtras,
  markdownToBlocks,
  markdownToBlocksSync,
  MATH_LANGS,
} from "./notes/markdown-to-blocks";
export { toStandardBlocks } from "./notes/blocks-to-markdown";
export { parseLinkLine, safeUrl } from "./canvas/mermaid-links";

// Canvases (octodraw). Pure — safe in browsers, the API and the CLI.
export type {
  CanvasDocument as OctodrawDocument,
  CanvasItem as OctodrawItem,
} from "./canvas/octodraw-types";
export { emptyOctodrawDocument, lineEnds as octodrawLineEnds } from "./canvas/octodraw-types";
export { isOctodrawDocument, toOctodrawDocument } from "./canvas/canvas-document";
export { mermaidToOctodraw } from "./canvas/mermaid-to-octodraw";
export { flowchartToOctodraw } from "./canvas/flowchart-to-octodraw";
export { MermaidParseError, parseMermaidFlowchart, type Flowchart } from "./canvas/mermaid-flowchart";
export { isClassDiagram, parseMermaidClassDiagram } from "./canvas/mermaid-class";
