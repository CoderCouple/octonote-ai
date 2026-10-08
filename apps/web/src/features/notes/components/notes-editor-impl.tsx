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
import { LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SaveState } from "@/components/save-indicator";
import { updateNoteClientApi } from "../api/notes-client-api";
import { appCanvasResolver } from "../blocks/app-canvas-resolver";
import { CanvasPickerDialog } from "../blocks/canvas-picker-dialog";
import { CanvasReferenceContext } from "../blocks/canvas-reference-context";
import { octoBlockNoteSchema } from "../lib/blocknote-schema";
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
}: NotesEditorProps) {
  const editor = useCreateBlockNote({
    schema: octoBlockNoteSchema,
    initialContent: blocksFrom(initialContent),
  }) as OctoEditor;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawMd, setRawMd] = useState("");
  const [tocHovered, setTocHovered] = useState(false);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    if (view !== "raw") return;
    try {
      setRawMd(editor.blocksToMarkdownLossy(editor.document));
    } catch (err) {
      setRawMd(`Couldn't convert to markdown: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [view, editor]);

  function insertCanvasReference(canvasId: string) {
    const current = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
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
        <div ref={scrollRef} className={`h-full overflow-auto ${tocHovered ? "hide-scrollbar" : ""}`}>
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
                      [...getDefaultReactSlashMenuItems(editor), canvasSlashItem(() => setPickerOpen(true))],
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
          <TableOfContentsRail editor={editor as never} scrollRef={scrollRef} onHoverChange={setTocHovered} />
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
