"use client";

import type { DeckDocument, SlideRenderers } from "@octonote/slides";
import { useMemo } from "react";
import { ReadOnlySlideBlocks } from "../components/slide-blocks";
import { SlideCanvas } from "../components/slide-canvas";

/**
 * How Octonote draws a slide's contents for @octonote/slides: note blocks with
 * the notes schema (BlockNote marks each block with `data-id`), canvases from
 * the deck's own copy.
 */
export function useSlideRenderers(deck: DeckDocument): SlideRenderers {
  return useMemo(
    () => ({
      // BlockNote puts data-id on a block's outer and inner element: builds and morphs use the outer one.
      blockSelector: (match: string) => `.bn-block-outer${match}`,
      renderBlocks: (blocks, { mode }) => <ReadOnlySlideBlocks blocks={blocks} mode={mode} />,
      renderCanvas: (canvas) => {
        const document = deck.canvases?.[canvas.canvasId];
        if (!document) return <div className="oxd-missing">This canvas isn&apos;t in the presentation any more.</div>;
        return <SlideCanvas document={document} itemId={canvas.itemId} dark={deck.theme !== "paper"} />;
      },
    }),
    [deck.canvases, deck.theme],
  );
}
