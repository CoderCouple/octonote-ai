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
  /**
   * Latest title/image for an embedded canvas figure. Absent on published
   * pages: there the block's stored image URL (a fixed path that always
   * serves the newest picture) is enough, and the canvas isn't exposed.
   */
  resolveFigure?: (figureId: string) => Promise<FigureTarget | null>;
  /**
   * Published project: the figure's canvas is on the same page, so the
   * block offers "See on canvas", which switches to it and zooms there.
   */
  openFigure?: (figureId: string) => void;
}

export interface FigureTarget {
  title: string;
  imageUrl: string | null;
  width: number;
  height: number;
  href: string;
}

const noAccess: CanvasReferenceResolver = {
  id: "none",
  resolve: async () => null,
};

export const CanvasReferenceContext =
  createContext<CanvasReferenceResolver>(noAccess);

export function useCanvasReferenceResolver() {
  return useContext(CanvasReferenceContext);
}
