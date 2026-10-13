"use client";

import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useEffect, useMemo } from "react";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { octoBlockNoteSchema } from "@/features/notes/lib/blocknote-schema";
import { publicCanvasResolver } from "../lib/public-canvas-resolver";

export interface NotesReadOnlyImplProps {
  initialContent: unknown;
  /** Published root slug — canvas-reference blocks resolve and link within it. */
  slug: string;
  /** Published project: embedded figures get "See on canvas". */
  onOpenFigure?: (figureId: string) => void;
  /**
   * The loaded blocks, ids included. Stored documents can lack block ids
   * (imported or seeded content); BlockNote assigns them on load, and the
   * heading minimap must use the ids that are actually in the page.
   */
  onLoaded?: (blocks: unknown[]) => void;
}

/** Readers never see editor hints like "Heading" or "Type '/' for commands" on empty blocks. */
const readerDictionary = {
  ...en,
  placeholders: Object.fromEntries(
    Object.keys(en.placeholders).map((k) => [k, undefined]),
  ),
};

export function NotesReadOnlyImpl({
  initialContent,
  slug,
  onOpenFigure,
  onLoaded,
}: NotesReadOnlyImplProps) {
  const blocks =
    initialContent &&
    typeof initialContent === "object" &&
    Array.isArray((initialContent as { blocks?: unknown }).blocks)
      ? ((initialContent as { blocks: unknown[] }).blocks as never)
      : undefined;
  const editor = useCreateBlockNote({
    schema: octoBlockNoteSchema,
    initialContent: blocks,
    dictionary: readerDictionary,
  });
  useEffect(() => {
    onLoaded?.(editor.document);
    // Once per editor: the reader never changes the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  const resolver = useMemo(
    () => ({ ...publicCanvasResolver(slug), openFigure: onOpenFigure }),
    [slug, onOpenFigure],
  );

  return (
    <CanvasReferenceContext.Provider value={resolver}>
      <BlockNoteView
        editor={editor}
        editable={false}
        slashMenu={false}
        sideMenu={false}
      />
    </CanvasReferenceContext.Provider>
  );
}
