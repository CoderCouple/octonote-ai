"use client";

import { toDeckDocument } from "@octonote/slides";
import { useMemo } from "react";
import { OctopusMark } from "@/components/octopus-mark";
import { CanvasReferenceContext } from "@/features/notes/blocks/canvas-reference-context";
import { publicCanvasResolver } from "@/features/public/lib/public-canvas-resolver";
import { DeckPlayer } from "./deck-player";

/** A published presentation inside someone else's page (an iframe): the slides and the controls, nothing else. */
export function EmbeddedDeck({ slug, title, document, start, href }: { slug: string; title: string; document: unknown; start: number; href: string }) {
  const deck = useMemo(() => toDeckDocument(document), [document]);
  const resolver = useMemo(() => publicCanvasResolver(slug), [slug]);
  return (
    <CanvasReferenceContext.Provider value={resolver}>
      <div className="flex h-svh flex-col gap-2 p-2">
        <DeckPlayer
          deck={deck}
          start={start}
          fit="contain"
          className="min-h-0 flex-1"
          actions={
            <a
              href={href}
              target="_blank"
              rel="noopener"
              title={`Open “${title}” on Octonote`}
              className="text-muted-foreground hover:text-foreground ml-1 flex h-9 items-center gap-1.5 text-xs"
            >
              <OctopusMark className="size-4" /> Octonote
            </a>
          }
        />
      </div>
    </CanvasReferenceContext.Provider>
  );
}
