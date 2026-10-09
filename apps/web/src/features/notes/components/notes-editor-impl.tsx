"use client";

import { filterSuggestionItems, type BlockNoteEditor } from "@blocknote/core";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { LayoutGrid, Sigma, SquareFunction, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SaveState } from "@/components/save-indicator";
import { updateNoteClientApi } from "../api/notes-client-api";
import { appCanvasResolver } from "../blocks/app-canvas-resolver";
import { CanvasPickerDialog } from "../blocks/canvas-picker-dialog";
import { CanvasReferenceContext } from "../blocks/canvas-reference-context";
import { octoBlockNoteSchema } from "../lib/blocknote-schema";
import { hasMarkdownExtras, markdownToBlocks } from "../lib/markdown-import";
import { TableOfContentsRail } from "./table-of-contents-rail";

const SAVE_DEBOUNCE_MS = 1200;

type OctoEditor = BlockNoteEditor<
  typeof octoBlockNoteSchema.blockSchema,
  typeof octoBlockNoteSchema.inlineContentSchema,
  typeof octoBlockNoteSchema.styleSchema
>;

export interface NotesEditorProps {
  pageId: string;
  initialContent: unknown;
  /** Workspace whose canvases the `/canvas` picker lists. */
  workspaceId: string;
  readOnly?: boolean;
  view?: "edit" | "raw";
  onSaveStateChange?: (state: SaveState) => void;
  /** Hands the parent a way to drop markdown into the note (e.g. text pasted into the title). */
  onEditorReady?: (api: NotesEditorApi) => void;
}

export interface NotesEditorApi {
  /** Parses markdown (math + Mermaid included) and inserts it at the top of the note. */
  insertMarkdownAtStart: (markdown: string) => void;
}

function canvasSlashItem(onOpen: () => void): DefaultReactSuggestionItem {
  return {
    title: "Canvas",
    subtext: "Link a canvas with a preview",
    aliases: ["canvas", "diagram", "drawing", "board", "whiteboard"],
    group: "Embeds",
    icon: <LayoutGrid className="size-4" />,
    onItemClick: onOpen,
  };
}

/** `/equation`, `/inline equation` and `/mermaid`. */
function mathAndDiagramSlashItems(
  editor: OctoEditor,
): DefaultReactSuggestionItem[] {
  const placeBlock = (block: { type: "mathBlock" | "mermaid" }) => {
    const current = editor.getTextCursorPosition().block;
    const empty =
      current.type === "paragraph" &&
      Array.isArray(current.content) &&
      current.content.length === 0;
    if (empty) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  };
  return [
    {
      title: "Equation",
      subtext: "A math equation on its own line (LaTeX)",
      aliases: ["math", "equation", "latex", "katex", "formula", "$$"],
      group: "Advanced",
      icon: <SquareFunction className="size-4" />,
      onItemClick: () => placeBlock({ type: "mathBlock" }),
    },
    {
      title: "Inline equation",
      subtext: "Math inside a sentence (LaTeX)",
      aliases: ["inline math", "inline equation", "$"],
      group: "Advanced",
      icon: <Sigma className="size-4" />,
      onItemClick: () =>
        editor.insertInlineContent([
          { type: "math", props: { latex: "x^2" } },
          " ",
        ]),
    },
    {
      title: "Mermaid diagram",
      subtext: "Flowcharts, sequence diagrams and more, from text",
      aliases: [
        "mermaid",
        "diagram",
        "flowchart",
        "sequence",
        "chart",
        "graph",
      ],
      group: "Advanced",
      icon: <Workflow className="size-4" />,
      onItemClick: () => placeBlock({ type: "mermaid" }),
    },
  ];
}

export function blocksFrom(content: unknown) {
  return content &&
    typeof content === "object" &&
    Array.isArray((content as { blocks?: unknown }).blocks)
    ? ((content as { blocks: unknown[] }).blocks as never)
    : undefined;
}

export function NotesEditor({
  pageId,
  initialContent,
  workspaceId,
  readOnly = false,
  view = "edit",
  onSaveStateChange,
  onEditorReady,
}: NotesEditorProps) {
  const editor = useCreateBlockNote({
    schema: octoBlockNoteSchema,
    initialContent: blocksFrom(initialContent),
    // Markdown with math or Mermaid gets our importer; everything else
    // (including copy/paste within notes) uses BlockNote's default.
    pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
      const data = event.clipboardData;
      const text = data?.getData("text/plain") ?? "";
      if (
        !text ||
        data?.types.includes("blocknote/html") ||
        !hasMarkdownExtras(text)
      )
        return defaultPasteHandler();
      const blocks = markdownToBlocks(ed, text);
      if (blocks.length === 0) return defaultPasteHandler();
      const current = ed.getTextCursorPosition().block;
      const emptyLine =
        current.type === "paragraph" &&
        Array.isArray(current.content) &&
        current.content.length === 0;
      // A single paragraph (e.g. "the formula $x^2$") pastes inline at the cursor.
      if (
        blocks.length === 1 &&
        blocks[0]!.type === "paragraph" &&
        !emptyLine
      ) {
        ed.insertInlineContent(blocks[0]!.content as never);
      } else if (emptyLine) {
        ed.replaceBlocks([current], blocks as never);
      } else {
        ed.insertBlocks(blocks as never, current, "after");
      }
      return true;
    },
  }) as OctoEditor;

  useEffect(() => {
    onEditorReady?.({
      insertMarkdownAtStart: (markdown) => {
        const blocks = markdownToBlocks(editor, markdown);
        if (blocks.length === 0) return;
        const doc = editor.document;
        const first = doc[0];
        const onlyEmpty =
          doc.length === 1 &&
          first?.type === "paragraph" &&
          Array.isArray(first.content) &&
          first.content.length === 0;
        if (!first || onlyEmpty) editor.replaceBlocks(doc, blocks as never);
        else editor.insertBlocks(blocks as never, first, "before");
      },
    });
  }, [editor, onEditorReady]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawMd, setRawMd] = useState("");
  const [tocHovered, setTocHovered] = useState(false);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (view !== "raw") return;
    try {
      setRawMd(editor.blocksToMarkdownLossy(editor.document));
    } catch (err) {
      setRawMd(
        `Couldn't convert to markdown: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [view, editor]);

  function insertCanvasReference(canvasId: string) {
    const current = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      current.type === "paragraph" &&
      Array.isArray(current.content) &&
      current.content.length === 0;
    const block = { type: "canvasReference" as const, props: { canvasId } };
    if (isEmptyParagraph) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  }

  function onChange() {
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const blocks = editor.document;
      let contentMd = "";
      try {
        contentMd = editor.blocksToMarkdownLossy(blocks);
      } catch (err) {
        console.error("Markdown conversion failed", err);
      }
      onSaveStateChange?.("saving");
      try {
        await updateNoteClientApi(pageId, { document: { blocks }, contentMd });
        onSaveStateChange?.("saved");
      } catch (err) {
        console.error("Note save failed", err);
        onSaveStateChange?.("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <CanvasReferenceContext.Provider value={appCanvasResolver}>
      <div className="bg-card relative h-full">
        <div
          ref={scrollRef}
          className={`h-full overflow-auto ${tocHovered ? "hide-scrollbar" : ""}`}
        >
          <div className={view === "raw" ? "hidden" : "contents"}>
            <BlockNoteView
              editor={editor}
              editable={!readOnly}
              onChange={onChange}
              slashMenu={false}
              sideMenu={!readOnly}
            >
              {readOnly ? null : (
                <SuggestionMenuController
                  triggerCharacter="/"
                  getItems={async (query) =>
                    filterSuggestionItems(
                      [
                        ...getDefaultReactSlashMenuItems(editor),
                        canvasSlashItem(() => setPickerOpen(true)),
                        ...mathAndDiagramSlashItems(editor),
                      ],
                      query,
                    )
                  }
                />
              )}
            </BlockNoteView>
          </div>
          {view === "raw" ? (
            <pre className="text-foreground h-full overflow-auto p-6 font-mono text-sm whitespace-pre-wrap">
              {rawMd}
            </pre>
          ) : null}
        </div>
        {view === "edit" ? (
          <TableOfContentsRail
            editor={editor as never}
            scrollRef={scrollRef}
            onHoverChange={setTocHovered}
          />
        ) : null}
        {readOnly ? null : (
          <CanvasPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            workspaceId={workspaceId}
            onPick={insertCanvasReference}
          />
        )}
      </div>
    </CanvasReferenceContext.Provider>
  );
}
