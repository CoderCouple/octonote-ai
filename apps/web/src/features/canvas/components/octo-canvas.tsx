"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createShapeId,
  getPointsFromDrawSegments,
  getSnapshot,
  loadSnapshot,
  Tldraw,
  type Editor,
  type TLArrowBinding,
  type TLDrawShape,
  type TLShape,
  type TLShapeId,
  type TLStoreSnapshot,
} from "tldraw";
import type { SaveState } from "@/components/save-indicator";
import { env } from "@/env/client";
import { updateCanvasClientApi } from "../api/canvases-client-api";
import { detectShape, type Point } from "../lib/shape-detector";
import {
  enableFigureDragOut,
  listCanvasFiguresClientApi,
  syncFigures,
} from "../lib/figures";
import { uploadCanvasThumbnail } from "../lib/thumbnail";
import { useTldrawTheme } from "../lib/use-tldraw-theme";
import { SHAPE_UTILS } from "../shapes/figure-shape";

// tldraw hides the canvas after 5s on non-localhost domains without a key.
const TLDRAW_LICENSE_KEY = env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined;

const SAVE_DEBOUNCE_MS = 1200;
// Thumbnails are expensive (render + upload); refresh them far less often than saves.
const THUMBNAIL_DEBOUNCE_MS = 8000;
const BIND_DISTANCE_PX = 50;
// Figure images refresh soon after a save so embeds catch up quickly.
const FIGURE_SYNC_DEBOUNCE_MS = 2500;

export interface OctoCanvasProps {
  canvasId: string;
  initialDocument: unknown;
  initialThumbnailUrl?: string | null;
  /** Viewers and the public page: no editing, no saving. */
  readOnly?: boolean;
  /** When true, freehand pencil strokes snap to clean shapes. */
  autoShape?: boolean;
  onSaveStateChange?: (state: SaveState) => void;
  /** Hands the tldraw editor to the pane (for the Figure / Ungroup buttons). */
  onEditor?: (editor: Editor) => void;
}

export function OctoCanvas({
  canvasId,
  initialDocument,
  initialThumbnailUrl = null,
  readOnly = false,
  autoShape = false,
  onSaveStateChange,
  onEditor,
}: OctoCanvasProps) {
  const autoShapeRef = useRef(autoShape);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailUrl = useRef<string | null>(initialThumbnailUrl);
  const figureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // figureId → fingerprint last pushed to the API; null until loaded.
  const knownFigures = useRef<Map<string, string> | null>(null);
  const onSaveStateRef = useRef(onSaveStateChange);
  onSaveStateRef.current = onSaveStateChange;
  const [editor, setEditor] = useState<Editor | null>(null);
  useTldrawTheme(editor);

  useEffect(() => {
    autoShapeRef.current = autoShape;
  }, [autoShape]);

  const snapshot = useMemo(() => {
    if (
      initialDocument &&
      typeof initialDocument === "object" &&
      Object.keys(initialDocument).length > 0
    ) {
      return initialDocument as TLStoreSnapshot;
    }
    return null;
  }, [initialDocument]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      if (figureTimer.current) clearTimeout(figureTimer.current);
    };
  }, []);

  function onMount(editor: Editor): void | (() => void) {
    if (snapshot) {
      try {
        loadSnapshot(editor.store, snapshot);
      } catch (error) {
        console.error("Failed to load canvas snapshot", error);
      }
    }
    editor.updateInstanceState({ isReadonly: readOnly });
    setEditor(editor);
    onEditor?.(editor);
    if (readOnly) {
      editor.zoomToFit();
      return;
    }
    registerShapeDetection(editor, autoShapeRef);
    // Drag a figure across into the note next to it (project split view).
    const stopDragOut = enableFigureDragOut(editor);
    editor.store.listen(() => scheduleSave(editor), {
      scope: "document",
      source: "user",
    });
    // Canvases created before their first thumbnail get one on open.
    if (!thumbnailUrl.current) scheduleThumbnail(editor, 2000);
    // Learn which figures the API already has, then catch up any that changed.
    void listCanvasFiguresClientApi(canvasId)
      .then((figures) => {
        knownFigures.current = new Map(
          figures.map((f) => [f.id, f.contentHash ?? ""]),
        );
        scheduleFigureSync(editor);
      })
      .catch((err) => console.warn("Couldn't load figures", err));
    // tldraw runs this when the editor goes away (not on React's dev double-mount).
    return stopDragOut;
  }

  function scheduleSave(editor: Editor) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      onSaveStateRef.current?.("saving");
      try {
        await updateCanvasClientApi(canvasId, {
          document: getSnapshot(editor.store),
        });
        onSaveStateRef.current?.("saved");
        scheduleThumbnail(editor);
        scheduleFigureSync(editor);
      } catch (err) {
        console.error("Canvas save failed", err);
        onSaveStateRef.current?.("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function scheduleThumbnail(editor: Editor, delay = THUMBNAIL_DEBOUNCE_MS) {
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(async () => {
      try {
        const url = await uploadCanvasThumbnail(
          editor,
          canvasId,
          thumbnailUrl.current,
        );
        if (url) thumbnailUrl.current = url;
      } catch (err) {
        // Non-fatal: the reference block falls back to a placeholder.
        console.warn(err);
      }
    }, delay);
  }

  function scheduleFigureSync(editor: Editor) {
    if (!knownFigures.current) return;
    if (figureTimer.current) clearTimeout(figureTimer.current);
    figureTimer.current = setTimeout(async () => {
      try {
        await syncFigures(editor, canvasId, knownFigures.current!);
      } catch (err) {
        // Non-fatal: embeds keep the previous picture; the next save retries.
        console.warn("Figure sync failed", err);
      }
    }, FIGURE_SYNC_DEBOUNCE_MS);
  }

  // tldraw needs explicit pixel dimensions; an absolute inset-0 wrapper keeps
  // the viewport from collapsing to 0x0 during flex layout passes.
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <Tldraw
          onMount={onMount}
          licenseKey={TLDRAW_LICENSE_KEY}
          hideUi={readOnly}
          shapeUtils={SHAPE_UTILS}
        />
      </div>
    </div>
  );
}

function registerShapeDetection(
  editor: Editor,
  isOn: React.MutableRefObject<boolean>,
) {
  function tryConvert(shape: TLDrawShape) {
    if (!isOn.current) return;
    if (!shape.props.isComplete) return;
    const worldPoints = extractWorldPoints(shape);
    if (worldPoints.length < 8) return;
    const detected = detectShape(worldPoints);
    if (!detected) return;
    const id = shape.id;
    setTimeout(() => convertShape(editor, id, detected), 0);
  }

  editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
    if (shape.type === "draw") tryConvert(shape as TLDrawShape);
  });

  editor.sideEffects.registerAfterChangeHandler("shape", (prev, next) => {
    if (next.type !== "draw") return;
    const prevDraw = prev as TLDrawShape;
    const nextDraw = next as TLDrawShape;
    if (prevDraw.props.isComplete || !nextDraw.props.isComplete) return;
    tryConvert(nextDraw);
  });
}

function extractWorldPoints(shape: TLDrawShape): Point[] {
  const local = getPointsFromDrawSegments(shape.props.segments);
  return local.map((p) => ({ x: shape.x + p.x, y: shape.y + p.y }));
}

function convertShape(
  editor: Editor,
  drawShapeId: TLShapeId,
  detected: NonNullable<ReturnType<typeof detectShape>>,
) {
  editor.run(() => {
    const drawShape = editor.getShape(drawShapeId);
    if (!drawShape) return;

    let newShapeId: TLShapeId | null = null;

    if (detected.kind === "circle" || detected.kind === "ellipse") {
      const w = detected.kind === "circle" ? detected.r * 2 : detected.rx * 2;
      const h = detected.kind === "circle" ? detected.r * 2 : detected.ry * 2;
      newShapeId = createShapeId();
      editor.createShape({
        id: newShapeId,
        type: "geo",
        x: detected.cx - w / 2,
        y: detected.cy - h / 2,
        props: { geo: "ellipse", w, h },
      });
    } else if (detected.kind === "rectangle") {
      newShapeId = createShapeId();
      editor.createShape({
        id: newShapeId,
        type: "geo",
        x: detected.x,
        y: detected.y,
        props: { geo: "rectangle", w: detected.w, h: detected.h },
      });
    } else if (detected.kind === "line") {
      const startPoint = { x: detected.x1, y: detected.y1 };
      const endPoint = { x: detected.x2, y: detected.y2 };
      const startShape = findGeoShapeNearPoint(editor, startPoint, drawShapeId);
      const endShape = findGeoShapeNearPoint(editor, endPoint, drawShapeId);

      const arrowId = createShapeId();
      editor.createShape({
        id: arrowId,
        type: "arrow",
        x: 0,
        y: 0,
        props: { start: startPoint, end: endPoint },
      });

      const bindings: Array<Omit<TLArrowBinding, "id" | "typeName">> = [];
      for (const [terminal, target] of [
        ["start", startShape],
        ["end", endShape],
      ] as const) {
        if (!target) continue;
        bindings.push({
          fromId: arrowId,
          toId: target.id,
          type: "arrow",
          props: {
            terminal,
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
            snap: "none",
          },
          meta: {},
        });
      }
      if (bindings.length > 0) editor.createBindings(bindings);
      newShapeId = arrowId;
    }

    editor.deleteShape(drawShapeId);
    if (newShapeId) editor.setSelectedShapes([newShapeId]);
  });
}

function findGeoShapeNearPoint(
  editor: Editor,
  point: Point,
  exclude: TLShapeId,
): TLShape | null {
  let best: { shape: TLShape; dist: number } | null = null;
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.id === exclude || shape.type !== "geo") continue;
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) continue;
    const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
    const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY);
    const dist = Math.hypot(dx, dy);
    if (dist > BIND_DISTANCE_PX) continue;
    if (!best || dist < best.dist) best = { shape, dist };
  }
  return best?.shape ?? null;
}
