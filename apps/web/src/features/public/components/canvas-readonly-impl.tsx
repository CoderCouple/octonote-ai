"use client";

import { useMemo } from "react";
import {
  loadSnapshot,
  Tldraw,
  type Editor,
  type TLShapeId,
  type TLStoreSnapshot,
} from "tldraw";
import { env } from "@/env/client";
import {
  FIGURE_TYPE,
  SHAPE_UTILS,
} from "@/features/canvas/shapes/figure-shape";

// The public page runs on the production domain too, so it needs the key as well.
const TLDRAW_LICENSE_KEY = env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined;

/** A figure on the canvas, in reading order (top to bottom, then left to right). */
export interface CanvasFigure {
  id: string;
  label: string;
  /** The `fig_` id notes embed the figure by (null on figures never synced). */
  figureId: string | null;
}

/**
 * What the published canvas page can do with the viewer, without importing
 * tldraw itself (it stays in this lazily loaded chunk).
 */
export interface CanvasViewApi {
  figures: CanvasFigure[];
  zoomToFigure: (id: string) => void;
  /** Zoom to the figure a note embeds (by its `fig_` id); false if it isn't on this canvas. */
  zoomToEmbeddedFigure: (figureId: string) => boolean;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface CanvasViewState {
  /** 1 = 100%. */
  zoom: number;
  /** The figure nearest the middle of the screen, if any. */
  activeFigureId: string | null;
}

const ANIMATE = { animation: { duration: 220 } } as const;

export function CanvasReadOnlyImpl({
  initialDocument,
  onReady,
  onViewChange,
  startOnFirstFigure = false,
}: {
  initialDocument: unknown;
  onReady?: (api: CanvasViewApi) => void;
  onViewChange?: (state: CanvasViewState) => void;
  /** Phones: open zoomed to the first figure so it's readable straight away. */
  startOnFirstFigure?: boolean;
}) {
  const snapshot = useMemo<TLStoreSnapshot | null>(() => {
    if (
      initialDocument &&
      typeof initialDocument === "object" &&
      Object.keys(initialDocument).length > 0
    ) {
      return initialDocument as TLStoreSnapshot;
    }
    return null;
  }, [initialDocument]);

  function onMount(editor: Editor) {
    if (snapshot) {
      try {
        loadSnapshot(editor.store, snapshot);
      } catch (err) {
        console.error("Failed to load canvas snapshot", err);
      }
    }
    editor.updateInstanceState({ isReadonly: true });
    // Saved snapshots keep the author's selection; readers shouldn't see it.
    editor.selectNone();

    const figureShapes = editor
      .getCurrentPageShapes()
      .filter((s) => (s as { type: string }).type === FIGURE_TYPE)
      .map((s) => ({ shape: s, bounds: editor.getShapePageBounds(s.id)! }))
      .filter((f) => f.bounds)
      .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    const figures = figureShapes.map(({ shape }) => ({
      id: shape.id as string,
      label: ((shape.props as { label?: string }).label || "Figure").trim(),
      figureId: (shape.meta as { figureId?: string }).figureId ?? null,
    }));

    const fit = (animated = true) => {
      // zoomToFit on an empty page collapses the viewport.
      if (editor.getCurrentPageShapes().length > 0)
        editor.zoomToFit(animated ? ANIMATE : { animation: { duration: 0 } });
    };
    const zoomToFigure = (id: string, animated = true) => {
      const bounds = editor.getShapePageBounds(id as TLShapeId);
      if (bounds)
        editor.zoomToBounds(bounds, {
          inset: 32,
          ...(animated ? ANIMATE : { animation: { duration: 0 } }),
        });
    };

    const report = () => {
      const zoom = editor.getZoomLevel();
      const view = editor.getViewportPageBounds();
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      let active: string | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const { shape, bounds } of figureShapes) {
        const dx = Math.max(bounds.minX - cx, 0, cx - bounds.maxX);
        const dy = Math.max(bounds.minY - cy, 0, cy - bounds.maxY);
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          active = shape.id;
        }
      }
      onViewChange?.({ zoom, activeFigureId: active });
    };
    // Camera moves are session-scoped store changes.
    editor.store.listen(report, { scope: "session" });

    setTimeout(() => {
      if (startOnFirstFigure && figures[0]) zoomToFigure(figures[0].id, false);
      else fit(false);
      report();
    }, 0);

    onReady?.({
      figures,
      zoomToFigure,
      zoomToEmbeddedFigure: (figureId) => {
        const f = figures.find((x) => x.figureId === figureId);
        if (f) zoomToFigure(f.id);
        return Boolean(f);
      },
      fit: () => fit(),
      zoomIn: () => editor.zoomIn(editor.getViewportScreenCenter(), ANIMATE),
      zoomOut: () => editor.zoomOut(editor.getViewportScreenCenter(), ANIMATE),
    });
  }

  return (
    <div className="bg-background relative h-full w-full">
      <div className="absolute inset-0">
        <Tldraw
          onMount={onMount}
          hideUi
          licenseKey={TLDRAW_LICENSE_KEY}
          shapeUtils={SHAPE_UTILS}
        />
      </div>
    </div>
  );
}
