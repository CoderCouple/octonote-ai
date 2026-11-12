/**
 * Note blocks → markdown (what `octonote note pull` writes). BlockNote's
 * serializer only knows the standard blocks, so Octonote's own blocks are
 * first rewritten into standard ones that read back the same way:
 * mermaid / math → fenced code, inline math → `$…$` code (read back as math
 * by markdownToBlocks), figures → images tagged with the figure id (read back
 * as figures), canvas references → a line of text, interactive blocks → a
 * fence named after their kind holding their JSON.
 */
import { figureUrl } from "./markdown-to-blocks";
import type { NoteBlock } from "./types";

export function toStandardBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.map(toStandard);
}

function codeBlock(language: string, code: string, children: NoteBlock[]): NoteBlock {
  return {
    type: "codeBlock",
    props: { language },
    content: [{ type: "text", text: code, styles: {} }],
    children,
  };
}

function toStandard(block: NoteBlock): NoteBlock {
  const children = Array.isArray(block.children) ? block.children.map(toStandard) : [];
  switch (block.type) {
    case "mermaid":
      return codeBlock("mermaid", String(block.props?.code ?? ""), children);
    case "mathBlock":
      return codeBlock("math", String(block.props?.latex ?? ""), children);
    case "manimVideo":
      return codeBlock("video", JSON.stringify({ videoId: String(block.props?.videoId ?? "") }), children);
    case "interactive": {
      let spec: unknown = {};
      try {
        spec = JSON.parse(String(block.props?.spec ?? "{}"));
      } catch {
        // Unreadable spec: still write the fence, so nothing is silently lost.
        return codeBlock(String(block.props?.kind ?? "widget"), String(block.props?.spec ?? ""), children);
      }
      return codeBlock(String(block.props?.kind ?? "widget"), JSON.stringify(spec, null, 2), children);
    }
    case "figure":
      return {
        type: "image",
        props: {
          // The fragment names the figure, so markdownToBlocks reads it back as one.
          url: block.props?.figureId
            ? figureUrl(
                String(block.props?.imageUrl ?? ""),
                String(block.props.figureId),
                Number(block.props?.width ?? 0),
                Number(block.props?.height ?? 0),
              )
            : String(block.props?.imageUrl ?? ""),
          // A caption makes BlockNote write HTML; the title rides in the alt text instead.
          caption: block.props?.figureId ? "" : String(block.props?.title ?? ""),
          name: String(block.props?.title ?? ""),
        },
        children,
      };
    case "canvasReference":
      return {
        type: "paragraph",
        content: [
          { type: "text", text: `Canvas: ${String(block.props?.canvasId ?? "")}`, styles: { italic: true } },
        ],
        children,
      };
  }
  let content = block.content;
  if (Array.isArray(content)) content = content.map(inlineToStandard);
  else if (content && content.type === "tableContent") {
    content = {
      ...content,
      rows: content.rows.map((row: NoteBlock) => ({
        ...row,
        cells: row.cells.map((cell: NoteBlock) =>
          Array.isArray(cell)
            ? cell.map(inlineToStandard)
            : { ...cell, content: Array.isArray(cell.content) ? cell.content.map(inlineToStandard) : cell.content },
        ),
      })),
    };
  }
  return { ...block, content, children };
}

function inlineToStandard(node: NoteBlock): NoteBlock {
  if (node.type === "math") {
    return { type: "text", text: `$${String(node.props?.latex ?? "")}$`, styles: { code: true } };
  }
  if (node.type === "link" && Array.isArray(node.content)) {
    return { ...node, content: node.content.map(inlineToStandard) };
  }
  return node;
}
