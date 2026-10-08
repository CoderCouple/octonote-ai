"use client";

/**
 * How a canvas-reference block finds its canvas and where it links. The
 * editor resolves through the authenticated API (`/c/<id>`); the published
 * reader resolves through the public endpoint and links inside `/pub/...`.
 */
import { createContext, useContext } from "react";

export interface CanvasReferenceTarget {
  title: string;
  thumbnailUrl: string | null;
  href: string;
}

export interface CanvasReferenceResolver {
  /** Part of the query cache key — distinct per resolver kind ("app", "public:<slug>"). */
  id: string;
  /** Resolves to null when the viewer can't see the canvas. */
  resolve: (canvasId: string) => Promise<CanvasReferenceTarget | null>;
}

const noAccess: CanvasReferenceResolver = { id: "none", resolve: async () => null };

export const CanvasReferenceContext = createContext<CanvasReferenceResolver>(noAccess);

export function useCanvasReferenceResolver() {
  return useContext(CanvasReferenceContext);
}
