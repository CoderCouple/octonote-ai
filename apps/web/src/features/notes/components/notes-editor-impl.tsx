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
import {
  AppWindow,
  Clapperboard,
  ClipboardCheck,
  Group,
  Layers,
  LayoutGrid,
  ListChecks,
  Network,
  Shuffle,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  SquareFunction,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SaveState } from "@/components/save-indicator";
import { updateNoteClientApi } from "../api/notes-client-api";
import { appCanvasResolver } from "../blocks/app-canvas-resolver";
import { CanvasPickerDialog } from "../blocks/canvas-picker-dialog";
import { ComposeAiDialog } from "../blocks/compose-ai-dialog";
import { INTERACTIVE_LABELS, NoteWorkspaceContext, starterSpec } from "../blocks/interactive-block";
import { VideoDialog } from "../blocks/manim-video-block";
import { FigurePickerDialog } from "../blocks/figure-picker-dialog";
import { uploadNoteImage } from "../lib/upload-image";
import { FIGURE_DROP_EVENT, getFigureClientApi } from "@/features/canvas";
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
  /** Rendered at the top of the scroll area (the note title), so it scrolls with the content. */
  header?: ReactNode;
}

export interface NotesEditorApi {
  /** Parses markdown (math + Mermaid included) and inserts it at the top of the note. */
  insertMarkdownAtStart: (markdown: string) => void;
}

function figureSlashItem(onOpen: () => void): DefaultReactSuggestionItem {
  return {
    title: "Figure",
    subtext: "Embed a figure from a canvas as an image",
    aliases: ["figure", "group", "frame", "picture"],
    group: "Embeds",
    icon: <Group className="size-4" />,
    onItemClick: onOpen,
  };
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

const INTERACTIVE_ITEMS: { kind: string; subtext: string; aliases: string[]; icon: React.JSX.Element }[] = [
  { kind: "widget", subtext: "Sliders that drive live numbers, charts and visuals", aliases: ["widget", "slider", "explorable", "calculator", "simulation", "chart"], icon: <SlidersHorizontal className="size-4" /> },
  { kind: "flashcards", subtext: "Two-sided cards with spaced repetition", aliases: ["flashcards", "cards", "memorise", "memorize", "study"], icon: <Layers className="size-4" /> },
  { kind: "mcq", subtext: "Questions checked one at a time, with hints", aliases: ["practice", "mcq", "multiple choice", "questions"], icon: <ListChecks className="size-4" /> },
  { kind: "quiz", subtext: "A scored test with a review at the end", aliases: ["quiz", "test", "assessment", "exam"], icon: <ClipboardCheck className="size-4" /> },
  { kind: "mindmap", subtext: "Explore how ideas connect", aliases: ["mind map", "mindmap", "tree", "concept map"], icon: <Network className="size-4" /> },
  { kind: "matching", subtext: "Match items to their partners", aliases: ["matching", "match", "pairs"], icon: <Shuffle className="size-4" /> },
  { kind: "scene", subtext: "A step-by-step animated explainer", aliases: ["animation", "scene", "explainer", "motion"], icon: <Clapperboard className="size-4" /> },
  { kind: "custom", subtext: "A small app that runs in a sandbox", aliases: ["custom", "app", "html", "game", "sandbox"], icon: <AppWindow className="size-4" /> },
];

/** `/widget`, `/flashcards`, `/quiz`… insert a starter to edit; `/build with ai` writes a section. */
function interactiveSlashItems(editor: OctoEditor, openAi: () => void, openVideo: () => void): DefaultReactSuggestionItem[] {
  const place = (kind: string) => {
    const block = { type: "interactive" as const, props: { kind, spec: starterSpec(kind) } };
    const current = editor.getTextCursorPosition().block;
    const empty = current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
    if (empty) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  };
  return [
    {
      title: "Build with AI",
      subtext: "Describe it; AI writes text plus widgets, quizzes or animations",
      aliases: ["ai", "build", "generate", "explain", "teach", "lesson"],
      group: "Interactive",
      icon: <Sparkles className="size-4" />,
      onItemClick: openAi,
    },
    {
      title: "Explainer video",
      subtext: "AI makes a 1–2 minute animated video (Manim) of a concept",
      aliases: ["video", "manim", "explainer", "animation video", "movie"],
      group: "Interactive",
      icon: <Clapperboard className="size-4" />,
      onItemClick: openVideo,
    },
    ...INTERACTIVE_ITEMS.map((item) => ({
      title: INTERACTIVE_LABELS[item.kind]!,
      subtext: item.subtext,
      aliases: item.aliases,
      group: "Interactive",
      icon: item.icon,
      onItemClick: () => place(item.kind),
    })),
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
  header,
}: NotesEditorProps) {
  const editor = useCreateBlockNote({
    schema: octoBlockNoteSchema,
    // Pasted, dropped and /image uploads go to Supabase Storage.
    uploadFile: (file) => uploadNoteImage(file, pageId),
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
  const [figurePickerOpen, setFigurePickerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const insertVideo = (videoId: string) => {
    const block = { type: "manimVideo" as const, props: { videoId } };
    const current = editor.getTextCursorPosition().block;
    const empty = current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
    if (empty) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  };

  /** Puts AI-written markdown after the cursor's block (or in place of an empty one). */
  const insertComposed = (markdown: string) => {
    const blocks = markdownToBlocks(editor, markdown);
    if (!blocks.length) return;
    const current = editor.getTextCursorPosition().block;
    const empty = current.type === "paragraph" && Array.isArray(current.content) && current.content.length === 0;
    if (empty) editor.replaceBlocks([current], blocks as never);
    else editor.insertBlocks(blocks as never, current, "after");
  };
  const [rawMd, setRawMd] = useState("");

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

  function insertFigure(
    figure: {
      id: string;
      title: string;
      imageUrl: string | null;
      width: number;
      height: number;
    },
    /** Insert after this block (a drop target) instead of at the cursor. */
    afterBlockId?: string,
  ) {
    const dropped = afterBlockId ? editor.getBlock(afterBlockId) : undefined;
    const current = dropped ?? editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      current.type === "paragraph" &&
      Array.isArray(current.content) &&
      current.content.length === 0;
    const block = {
      type: "figure" as const,
      props: {
        figureId: figure.id,
        title: figure.title,
        // The fixed object URL (no version) always serves the newest picture.
        imageUrl: figure.imageUrl?.split("?")[0] ?? "",
        width: figure.width,
        height: figure.height,
      },
    };
    if (isEmptyParagraph) editor.replaceBlocks([current], [block]);
    else editor.insertBlocks([block], current, "after");
  }

  /**
   * A figure dragged here from a canvas's title-bar handle (e.g. in a
   * project's split view). It lands after the block under the pointer.
   */
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const insertFigureRef = useRef(insertFigure);
  insertFigureRef.current = insertFigure;
  useEffect(() => {
    const zone = dropZoneRef.current;
    if (!zone || readOnly) return;
    const onFigureDrop = async (event: Event) => {
      const { figureId, x, y } = (
        event as CustomEvent<{ figureId: string; x: number; y: number }>
      ).detail;
      const blockId =
        document
          .elementFromPoint(x, y)
          ?.closest(".bn-block-outer[data-id]")
          ?.getAttribute("data-id") ?? undefined;
      try {
        insertFigureRef.current(await getFigureClientApi(figureId), blockId);
      } catch {
        toast.message(
          "That figure is still saving — try again in a few seconds.",
        );
      }
    };
    zone.addEventListener(FIGURE_DROP_EVENT, onFigureDrop);
    return () => zone.removeEventListener(FIGURE_DROP_EVENT, onFigureDrop);
  }, [readOnly]);

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
      {/* Blocks that create things next to the note (a canvas from a mind map) need its workspace. */}
      <NoteWorkspaceContext.Provider value={workspaceId}>
      <div
        ref={dropZoneRef}
        data-figure-drop-zone={readOnly ? undefined : ""}
        // ph-no-capture: the note never appears in product-analytics replays.
        className="ph-no-capture bg-card relative h-full data-[figure-drop-active]:ring-2 data-[figure-drop-active]:ring-inset data-[figure-drop-active]:ring-[var(--foreground-strong)]"
      >
        <div
          ref={scrollRef}
          // The heading minimap on the right is the scrollbar, so hide the native one.
          className="hide-scrollbar h-full overflow-auto"
        >
          {view === "raw" ? null : header}
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
                        figureSlashItem(() => setFigurePickerOpen(true)),
                        ...mathAndDiagramSlashItems(editor),
                        ...interactiveSlashItems(editor, () => setAiOpen(true), () => setVideoOpen(true)),
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
          <TableOfContentsRail editor={editor as never} scrollRef={scrollRef} />
        ) : null}
        {readOnly ? null : (
          <>
            <CanvasPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              workspaceId={workspaceId}
              onPick={insertCanvasReference}
            />
            <FigurePickerDialog
              open={figurePickerOpen}
              onOpenChange={setFigurePickerOpen}
              workspaceId={workspaceId}
              onPick={insertFigure}
            />
            <ComposeAiDialog open={aiOpen} onOpenChange={setAiOpen} onInsert={insertComposed} />
            <VideoDialog open={videoOpen} onOpenChange={setVideoOpen} workspaceId={workspaceId} onCreated={insertVideo} />
          </>
        )}
      </div>
      </NoteWorkspaceContext.Provider>
    </CanvasReferenceContext.Provider>
  );
}
