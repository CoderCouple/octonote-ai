"use client";

import {
  OctoCanvas,
  type Box,
  type OctoCanvasHandle,
} from "@octonote/octodraw";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toCanvasDocument } from "@/features/canvas/lib/document";
import { figureApiId, figureItems, figureLabel } from "@/features/canvas/lib/figures";
import {
  CANVAS_THEMES,
  useCanvasColorScheme,
} from "@/features/canvas/lib/octodraw-theme";

/** A figure on the canvas, in reading order (top to bottom, then left to right). */
export interface CanvasFigure {
  id: string;
  label: string;
  /** The `fig_` id notes embed the figure by. */
  figureId: string | null;
}

/**
 * What the published canvas page can do with the viewer, without importing
 * octodraw itself (it stays in this lazily loaded chunk).
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

const noop = () => undefined;

export function CanvasReadOnlyImpl({
  canvasId,
  initialDocument,
  onReady,
  onViewChange,
  startOnFirstFigure = false,
}: {
  /** Needed to map figures to the ids notes embed them by. */
  canvasId?: string;
  initialDocument: unknown;
  onReady?: (api: CanvasViewApi) => void;
  onViewChange?: (state: CanvasViewState) => void;
  /** Phones: open zoomed to the first figure so it's readable straight away. */
  startOnFirstFigure?: boolean;
}) {
  const doc = useMemo(() => toCanvasDocument(initialDocument), [initialDocument]);
  const colorScheme = useCanvasColorScheme();
  const handle = useRef<OctoCanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const figures = useMemo(
    () =>
      figureItems(doc)
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x),
    [doc],
  );

  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // The canvas reports the visible box as the camera moves.
  const onPresenceChange = useCallback(
    ({ view }: { view: Box }) => {
      const width = rootRef.current?.clientWidth ?? 0;
      const zoom = width > 0 && view.w > 0 ? width / view.w : 1;
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      let active: string | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const f of figures) {
        const dx = Math.max(f.x - cx, 0, cx - (f.x + f.w));
        const dy = Math.max(f.y - cy, 0, cy - (f.y + f.h));
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          active = f.id;
        }
      }
      onViewChangeRef.current?.({ zoom, activeFigureId: active });
    },
    [figures],
  );

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    const zoomToFigure = (id: string) => handle.current?.focusItem(id);
    const fit = () => handle.current?.zoomToFit();
    // Wait a frame so the canvas knows its size.
    const frame = requestAnimationFrame(() => {
      if (startOnFirstFigure && figures[0]) zoomToFigure(figures[0].id);
      onReadyRef.current?.({
        figures: figures.map((f) => ({
          id: f.id,
          label: figureLabel(f),
          figureId: canvasId ? figureApiId(canvasId, f.id) : null,
        })),
        zoomToFigure,
        zoomToEmbeddedFigure: (figureId) => {
          const f = figures.find(
            (x) => (canvasId ? figureApiId(canvasId, x.id) : x.id) === figureId,
          );
          if (f) zoomToFigure(f.id);
          return Boolean(f);
        },
        fit,
        zoomIn: () => handle.current?.zoomIn(),
        zoomOut: () => handle.current?.zoomOut(),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [figures, canvasId, startOnFirstFigure]);

  return (
    // The page has its own zoom controls and figure list: hide the canvas's corner chrome.
    <div
      ref={rootRef}
      className="bg-background relative h-full w-full [&_.occ-corner]:!hidden"
    >
      <OctoCanvas
        ref={handle}
        doc={doc}
        onChange={noop}
        readOnly
        grid={false}
        colorScheme={colorScheme}
        themes={CANVAS_THEMES}
        onPresenceChange={onPresenceChange}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}
