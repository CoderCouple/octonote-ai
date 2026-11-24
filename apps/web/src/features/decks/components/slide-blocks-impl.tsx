"use client";

import { filterSuggestionItems } from "@blocknote/core";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import type { NoteBlock, SlideMode } from "@octonote/slides";
import { AppWindow, Clapperboard, Image as ImageIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { INTERACTIVE_LABELS } from "@/features/notes/blocks/interactive-block";
import { ComposeAiDialog } from "@/features/notes/blocks/compose-ai-dialog";
import { FigurePickerDialog } from "@/features/notes/blocks/figure-picker-dialog";
import { VideoDialog } from "@/features/notes/blocks/manim-video-block";
import { figureSlashItem, groupedSlashItems, interactiveSlashItems, mathAndDiagramSlashItems, type OctoEditor } from "@/features/notes/components/notes-editor-impl";
import { markdownToBlocks } from "@/features/notes/lib/markdown-import";
import { octoBlockNoteSchema } from "@/features/notes/lib/blocknote-schema";
import { uploadNoteImage } from "@/features/notes/lib/upload-image";
import { readerDictionary } from "@/features/public/components/notes-readonly-impl";

/** Blocks a picture of a slide shows as a labelled tile instead of running (apps, videos). */
const HEAVY = (b: NoteBlock) => b.type === "manimVideo" || b.type === "video" || (b.type === "interactive" && b.props?.kind === "custom");

function tileLabel(b: NoteBlock): { label: string; icon: ReactNode } {
  if (b.type === "manimVideo" || b.type === "video") return { label: "Video", icon: <Clapperboard className="size-[1.2em]" /> };
  if (b.type === "interactive") return { label: INTERACTIVE_LABELS[b.props?.kind] ?? "Block", icon: <AppWindow className="size-[1.2em]" /> };
  return { label: "Block", icon: <ImageIcon className="size-[1.2em]" /> };
}

/** One run of ordinary blocks, drawn by BlockNote exactly as a note draws them. */
function ReadOnlyRun({ blocks }: { blocks: NoteBlock[] }) {
  const editor = useCreateBlockNote({ schema: octoBlockNoteSchema, initialContent: blocks as never, dictionary: readerDictionary });
  return <BlockNoteView editor={editor} editable={false} sideMenu={false} slashMenu={false} formattingToolbar={false} />;
}

/**
 * A slide region's blocks, read-only. Live slides run everything; a picture
 * of a slide (presenter view) shows apps and videos as tiles, so they don't
 * play twice. Each tile keeps the block's id for builds.
 */
export function ReadOnlySlideBlocks({ blocks, mode }: { blocks: NoteBlock[]; mode: SlideMode }) {
  if (!blocks.length) return null;
  if (mode === "live" || !blocks.some(HEAVY)) return <ReadOnlyRun key={runKey(blocks)} blocks={blocks} />;
  const parts: ReactNode[] = [];
  let run: NoteBlock[] = [];
  const flush = () => {
    if (run.length) parts.push(<ReadOnlyRun key={runKey(run)} blocks={run} />);
    run = [];
  };
  for (const b of blocks) {
    if (!HEAVY(b)) {
      run.push(b);
      continue;
    }
    flush();
    const { label, icon } = tileLabel(b);
    parts.push(
      <div key={b.id} data-id={b.id} className="oxd-tile bn-block-outer">
        {icon}
        <span>{label}</span>
      </div>,
    );
  }
  flush();
  return <>{parts}</>;
}

/** A new editor whenever the blocks are replaced from outside (another slide, a reload). */
const runKey = (blocks: NoteBlock[]) => blocks.map((b) => b.id).join("|");

export interface EditableSlideBlocksProps {
  deckId: string;
  workspaceId: string;
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  placeholder?: string;
}

/**
 * A slide region in the editor: the note editor's blocks and `/` menu
 * (quiz, custom app, video, maths, mermaid, figures), sized for a slide.
 */
export function EditableSlideBlocks({ deckId, workspaceId, blocks, onChange }: EditableSlideBlocksProps) {
  const editor = useCreateBlockNote({
    schema: octoBlockNoteSchema,
    initialContent: blocks.length ? (blocks as never) : undefined,
    uploadFile: (file) => uploadNoteImage(file, deckId),
  }) as OctoEditor;
  const [figureOpen, setFigureOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const place = (block: never) => {
    const current = editor.getTextCursorPosition().block;
    const empty = current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
    if (empty) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  };

  return (
    <>
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        onChange={() => changeRef.current(editor.document as NoteBlock[])}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              groupedSlashItems([
                ...getDefaultReactSlashMenuItems(editor),
                figureSlashItem(() => setFigureOpen(true)),
                ...mathAndDiagramSlashItems(editor),
                ...interactiveSlashItems(editor, () => setAiOpen(true), () => setVideoOpen(true)),
              ]),
              query,
            )
          }
        />
      </BlockNoteView>
      <FigurePickerDialog
        open={figureOpen}
        onOpenChange={setFigureOpen}
        workspaceId={workspaceId}
        onPick={(f) =>
          place({
            type: "figure",
            props: { figureId: f.id, title: f.title, imageUrl: f.imageUrl?.split("?")[0] ?? "", width: f.width, height: f.height },
          } as never)
        }
      />
      <ComposeAiDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onInsert={(markdown) => {
          const made = markdownToBlocks(editor, markdown);
          if (made.length) {
            const current = editor.getTextCursorPosition().block;
            editor.insertBlocks(made as never, current, "after");
          }
        }}
      />
      <VideoDialog open={videoOpen} onOpenChange={setVideoOpen} workspaceId={workspaceId} onCreated={(videoId) => place({ type: "manimVideo", props: { videoId } } as never)} />
    </>
  );
}
