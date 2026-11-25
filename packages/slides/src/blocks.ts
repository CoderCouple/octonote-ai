/**
 * Note blocks as slides read them. Slides hold ordinary note blocks
 * (BlockNote JSON, the same schema notes use); the host app's editor
 * validates them, slides only read ids, types and text.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoteBlock = Record<string, any>;

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const blocksOf = (v: unknown): NoteBlock[] => (Array.isArray(v) ? v.filter((b): b is NoteBlock => isObject(b) && typeof b.type === "string") : []);

/** Blocks that are the point of a slide on their own (a quiz, video, app, diagram, table): they get an object of their own. */
const MEDIA_TYPES = new Set(["interactive", "manimVideo", "mermaid", "figure", "canvasReference", "image", "video", "audio", "file", "table"]);

export const isMediaBlock = (b: NoteBlock) => MEDIA_TYPES.has(b.type);

/** Ids of the blocks and their nested children (list items inside list items). */
export function allBlockIds(blocks: NoteBlock[]): string[] {
  return blocks.flatMap((b) => [...(typeof b.id === "string" ? [b.id] : []), ...allBlockIds(blocksOf(b.children))]);
}

/** Plain text of a block's inline content (text, links, inline math as its LaTeX). */
export function blockText(block: NoteBlock): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: NoteBlock) => {
      if (typeof c?.text === "string") return c.text;
      if (Array.isArray(c?.content)) return c.content.map((x: NoteBlock) => x?.text ?? "").join("");
      if (c?.type === "math" && typeof c.props?.latex === "string") return `$${c.props.latex}$`;
      return "";
    })
    .join("");
}

export function heading(text: string, level: 1 | 2 | 3): NoteBlock {
  return {
    id: globalThis.crypto.randomUUID(),
    type: "heading",
    props: { level },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

export function paragraph(text: string): NoteBlock {
  return {
    id: globalThis.crypto.randomUUID(),
    type: "paragraph",
    props: {},
    content: text ? [{ type: "text", text, styles: {} }] : [],
    children: [],
  };
}

export const bullet = (text: string): NoteBlock => ({ ...paragraph(text), type: "bulletListItem" });

/** Fresh ids for a copied block and its children, with the old → new map. */
export function copyBlocks(blocks: NoteBlock[], ids = new Map<string, string>()): NoteBlock[] {
  return blocks.map((b) => {
    const id = globalThis.crypto.randomUUID();
    if (typeof b.id === "string") ids.set(b.id, id);
    return { ...b, id, children: copyBlocks(blocksOf(b.children), ids) };
  });
}
