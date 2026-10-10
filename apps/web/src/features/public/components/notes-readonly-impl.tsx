"use client";

import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useMemo } from "react";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { octoBlockNoteSchema } from "@/features/notes/lib/blocknote-schema";
import { publicCanvasResolver } from "../lib/public-canvas-resolver";

export interface NotesReadOnlyImplProps {
  initialContent: unknown;
  /** Published root slug — canvas-reference blocks resolve and link within it. */
  slug: string;
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
  const resolver = useMemo(() => publicCanvasResolver(slug), [slug]);

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
