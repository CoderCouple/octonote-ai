"use client";

import { useMemo } from "react";
import { appCanvasResolver } from "@/features/notes/blocks/app-canvas-resolver";
import { publicCanvasResolver } from "@/features/public/lib/public-canvas-resolver";
import { DeckPrint } from "./deck-print";

/** The print layout with the right block resolver: in the app, or under a published slug. */
export function PrintableDeck({ title, document, notes, slug }: { title: string; document: unknown; notes?: boolean; slug?: string }) {
  const resolver = useMemo(() => (slug ? publicCanvasResolver(slug) : appCanvasResolver), [slug]);
  return <DeckPrint title={title} document={document} notes={notes} resolver={resolver} />;
}
