"use client";

import {
  OctoCanvas as Canvas,
  updateItem,
  useCanvasHistory,
  type CanvasChangeMeta,
  type CanvasDocument,
  type CommentAuthor,
  type OctoCanvasHandle,
} from "@octonote/octodraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SaveState } from "@/components/save-indicator";
import { uploadNoteImage } from "@/features/notes/lib/upload-image";
import {
  listCanvasPeopleClientApi,
  updateCanvasClientApi,
} from "../api/canvases-client-api";
import { autoShape as applyAutoShape } from "../lib/auto-shape";
import { toCanvasDocument } from "../lib/document";
import {
  enableFigureDragOut,
  figureApiId,
  figureItems,
  listCanvasFiguresClientApi,
  syncFigures,
} from "../lib/figures";
import { CANVAS_THEMES, useCanvasColorScheme } from "../lib/octodraw-theme";
import { rearrangeDocument, type RearrangeDirection } from "../lib/rearrange";
import { uploadCanvasThumbnail } from "../lib/thumbnail";
import { FigureCodePane } from "./figure-code-pane";

const SAVE_DEBOUNCE_MS = 1200;
// Thumbnails are expensive (render + upload); refresh them far less often than saves.
const THUMBNAIL_DEBOUNCE_MS = 8000;
// Figure images refresh soon after a save so embeds catch up quickly.
const FIGURE_SYNC_DEBOUNCE_MS = 2500;

/** What the canvas pane's header buttons can do with the editor. */
export interface CanvasEditorApi {
  /** Lays out the selection (or the whole canvas); false when there's nothing to do. */
  rearrange: (direction: RearrangeDirection) => boolean;
  undo: () => void;
  zoomToFit: () => void;
}

export interface OctoCanvasProps {
  canvasId: string;
  initialDocument: unknown;
  initialThumbnailUrl?: string | null;
  /** Viewers: no editing, no saving. */
  readOnly?: boolean;
  /** When true, freehand pen strokes snap to clean shapes. */
  autoShape?: boolean;
  onSaveStateChange?: (state: SaveState) => void;
  /** Hands the pane what its header buttons need (Rearrange). */
  onEditor?: (api: CanvasEditorApi) => void;
  /** The signed-in person; comments are posted under their name. */
  user?: CommentAuthor | null;
}

export function OctoCanvas({
  canvasId,
  initialDocument,
  initialThumbnailUrl = null,
  readOnly = false,
  autoShape = false,
  onSaveStateChange,
  onEditor,
  user,
}: OctoCanvasProps) {
  // The stored document is read once; after that the editor owns it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => toCanvasDocument(initialDocument), []);
  const history = useCanvasHistory(initial);
  const { doc, change, undo, redo } = history;
  const docRef = useRef(doc);
  docRef.current = doc;
  const colorScheme = useCanvasColorScheme();
  const handle = useRef<OctoCanvasHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<string[]>([]);
  // Who can be @mentioned in comments: everyone with access to the canvas.
  const [people, setPeople] = useState<CommentAuthor[]>();
  const userId = user?.id;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const autoShapeRef = useRef(autoShape);
  autoShapeRef.current = autoShape;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const figureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailUrl = useRef<string | null>(initialThumbnailUrl);
  // figureId → fingerprint last pushed to the API; null until loaded.
  const knownFigures = useRef<Map<string, string> | null>(null);
  // Figure ids seen on this canvas while it's open (only those may be deleted).
  const ownedFigures = useRef(new Set<string>());
  const onSaveStateRef = useRef(onSaveStateChange);
  onSaveStateRef.current = onSaveStateChange;

  const onChange = useCallback(
    (next: CanvasDocument, meta?: CanvasChangeMeta) => {
      if (readOnly) return;
      change(
        autoShapeRef.current && !meta?.silent
          ? applyAutoShape(docRef.current, next)
          : next,
        meta,
      );
    },
    [change, readOnly],
  );

  const scheduleThumbnail = useCallback(
    (delay = THUMBNAIL_DEBOUNCE_MS) => {
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      thumbTimer.current = setTimeout(async () => {
        try {
          const url = await uploadCanvasThumbnail(
            docRef.current,
            canvasId,
            thumbnailUrl.current,
          );
          if (url) thumbnailUrl.current = url;
        } catch (err) {
          // Non-fatal: the reference block falls back to a placeholder.
          console.warn(err);
        }
      }, delay);
    },
    [canvasId],
  );

  const scheduleFigureSync = useCallback(() => {
    if (!knownFigures.current) return;
    if (figureTimer.current) clearTimeout(figureTimer.current);
    figureTimer.current = setTimeout(async () => {
      try {
        await syncFigures(
          docRef.current,
          canvasId,
          knownFigures.current!,
          ownedFigures.current,
        );
      } catch (err) {
        // Non-fatal: embeds keep the previous picture; the next save retries.
        console.warn("Figure sync failed", err);
      }
    }, FIGURE_SYNC_DEBOUNCE_MS);
  }, [canvasId]);

  // The document the API has. Compared against this (not the opened
  // document), so undoing back to how the canvas opened is saved too.
  const savedDoc = useRef(initial);

  // Every change (edits, undo, redo) is saved on a debounce.
  useEffect(() => {
    if (readOnly || doc === savedDoc.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      onSaveStateRef.current?.("saving");
      try {
        const sending = docRef.current;
        await updateCanvasClientApi(canvasId, { document: sending });
        savedDoc.current = sending;
        onSaveStateRef.current?.("saved");
        scheduleThumbnail();
        scheduleFigureSync();
      } catch (err) {
        console.error("Canvas save failed", err);
        onSaveStateRef.current?.("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }, [doc, readOnly, canvasId, scheduleThumbnail, scheduleFigureSync]);

  useEffect(() => {
    if (readOnly) return;
    // Canvases created before their first thumbnail get one on open.
    if (!thumbnailUrl.current && initial.items.length > 0) scheduleThumbnail(2000);
    for (const item of figureItems(initial))
      ownedFigures.current.add(figureApiId(canvasId, item.id));
    // Learn which figures the API already has, then catch up any that changed.
    let live = true;
    void listCanvasFiguresClientApi(canvasId)
      .then((figures) => {
        if (!live) return;
        knownFigures.current = new Map(
          figures.map((f) => [f.id, f.contentHash ?? ""]),
        );
        scheduleFigureSync();
      })
      .catch((err) => console.warn("Couldn't load figures", err));
    return () => {
      live = false;
    };
  }, [readOnly, canvasId, initial, scheduleThumbnail, scheduleFigureSync]);

  useEffect(() => {
    return () => {
      // Leaving with an edit still pending: save it now rather than drop it.
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (!readOnly && docRef.current !== savedDoc.current)
          void updateCanvasClientApi(canvasId, { document: docRef.current }).catch(
            () => undefined,
          );
      }
      if (thumbTimer.current) clearTimeout(thumbTimer.current);
      if (figureTimer.current) clearTimeout(figureTimer.current);
    };
  }, [canvasId, readOnly]);

  // Drag a figure across into the note next to it (project split view).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || readOnly) return;
    let before: CanvasDocument | null = null;
    const stop = enableFigureDragOut(
      root,
      () => {
        const ids = selectionRef.current;
        const item =
          ids.length === 1
            ? docRef.current.items.find((i) => i.id === ids[0])
            : undefined;
        if (item?.type !== "figure") return null;
        before ??= docRef.current;
        return figureApiId(canvasId, item.id);
      },
      () => {
        // The figure stays where it was on the canvas.
        if (before && docRef.current !== before) undo();
        before = null;
      },
    );
    const reset = () => {
      before = null;
    };
    root.addEventListener("pointerdown", reset, true);
    return () => {
      stop();
      root.removeEventListener("pointerdown", reset, true);
    };
  }, [readOnly, canvasId, undo]);

  useEffect(() => {
    if (readOnly || !userId) return;
    let live = true;
    void listCanvasPeopleClientApi(canvasId)
      .then((list) => live && setPeople(list))
      .catch((err) => console.warn("Couldn't load people to mention", err));
    return () => {
      live = false;
    };
  }, [readOnly, canvasId, userId]);

  // The figure whose code is open beside the canvas ("Code" on a figure).
  const [codeFigureId, setCodeFigureId] = useState<string | null>(null);
  const codeFigure = codeFigureId
    ? doc.items.find((i) => i.id === codeFigureId && i.type === "figure")
    : undefined;
  // A burst of typing is one undo step: its first keystroke records the
  // step, the rest update the figure silently until a pause.
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editCode = useCallback(
    (source: string) => {
      if (!codeFigureId) return;
      const next = updateItem(docRef.current, codeFigureId, { source });
      change(next, typing.current ? { silent: true } : undefined);
      if (typing.current) clearTimeout(typing.current);
      typing.current = setTimeout(() => (typing.current = null), 1200);
    },
    [change, codeFigureId],
  );

  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;
  useEffect(() => {
    onEditorRef.current?.({
      rearrange: (direction) => {
        const next = rearrangeDocument(
          docRef.current,
          selectionRef.current,
          direction,
        );
        if (!next) return false;
        change(next);
        // The whole canvas moved: show all of it.
        if (selectionRef.current.length < 2)
          requestAnimationFrame(() => handle.current?.zoomToFit());
        return true;
      },
      undo,
      zoomToFit: () => handle.current?.zoomToFit(),
    });
  }, [change, undo]);

  const onUploadImage = useCallback(
    async (file: File) => {
      try {
        return await uploadNoteImage(file, canvasId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image upload failed.");
        throw err;
      }
    },
    [canvasId],
  );

  return (
    // ph-no-capture: the canvas never appears in product-analytics replays.
    <div ref={rootRef} className="ph-no-capture relative h-full w-full">
      <Canvas
        ref={handle}
        doc={doc}
        onChange={onChange}
        onUndo={readOnly ? undefined : undo}
        onRedo={readOnly ? undefined : redo}
        selection={selection}
        onSelectionChange={setSelection}
        readOnly={readOnly}
        user={user ?? undefined}
        people={people}
        colorScheme={colorScheme}
        themes={CANVAS_THEMES}
        onUploadImage={readOnly ? undefined : onUploadImage}
        onOpenFigure={readOnly ? undefined : setCodeFigureId}
        style={{ position: "absolute", inset: 0 }}
      />
      {codeFigure && codeFigure.type === "figure" ? (
        <FigureCodePane
          source={codeFigure.source}
          onChange={editCode}
          onClose={() => setCodeFigureId(null)}
        />
      ) : null}
    </div>
  );
}
