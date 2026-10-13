/**
 * Pasting markdown into a note: BlockNote's parser plus Octonote's extras
 * (`$…$` / `$$…$$` math, ```mermaid / ```math fences). The logic lives in
 * @octonote/content so the editor, the API and the CLI convert identically.
 */
import type { BlockNoteEditor } from "@blocknote/core";
import { markdownToBlocksSync, type NoteBlock } from "@octonote/content";

export { hasMarkdownExtras } from "@octonote/content";

type AnyEditor = BlockNoteEditor<any, any, any>;

export function markdownToBlocks(editor: AnyEditor, markdown: string): NoteBlock[] {
  return markdownToBlocksSync(
    markdown,
    (md) => editor.tryParseMarkdownToBlocks(md) as NoteBlock[],
  );
}
