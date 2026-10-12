/**
 * Figures on the canvas: wrap the selection in one, dissolve one, and keep
 * each figure's exported PNG in sync with the API so notes that embed it
 * always show the latest picture.
 */
import { generateId } from "@octonote/shared";
import { ApiError } from "@octonote/api-client";
import {
  createShapeId,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import { clientApi } from "@/lib/api/client-fetch";
export {
  getFigureClientApi,
  listCanvasFiguresClientApi,
  listWorkspaceFiguresClientApi,
  type FigureSummary,
} from "../api/figures-client-api";
import { FIGURE_DROP_EVENT } from "../constants";
import { FIGURE_TITLE_HEIGHT, FIGURE_TYPE } from "../shapes/figure-shape";

const PADDING = 24;
/** Exported figures are capped at this width (px) to keep uploads small. */
const MAX_EXPORT_WIDTH = 1600;

type FigureLike = TLShape & {
  props: { w: number; h: number; label: string };
  meta: { figureId?: string };
};

const isFigure = (s: TLShape | undefined): s is FigureLike =>
  (s as { type?: string } | undefined)?.type === FIGURE_TYPE;

/** Wraps the selected shapes in a new figure. Returns false when nothing is selected. */
export function wrapSelectionInFigure(
  editor: Editor,
  label = "Figure",
): boolean {
  const selected = editor.getSelectedShapeIds();
  const bounds = editor.getSelectionPageBounds();
  if (selected.length === 0 || !bounds) return false;
  const id = createShapeId();
  editor.run(() => {
    editor.createShapes([
      {
        id,
        type: FIGURE_TYPE,
        x: bounds.x - PADDING,
        y: bounds.y - PADDING - FIGURE_TITLE_HEIGHT,
        props: {
          w: bounds.w + PADDING * 2,
          h: bounds.h + PADDING * 2 + FIGURE_TITLE_HEIGHT,
          label,
        },
        meta: { figureId: generateId("fig") },
      } as never,
    ]);
    // Behind its contents, then adopt them.
    editor.sendToBack([id]);
    editor.reparentShapes(selected, id);
    editor.setSelectedShapes([id]);
  });
  return true;
}

/**
 * Selected figure(s) → dissolve them (contents stay on the page).
 * Selected shapes inside a figure → lift them out of it.
 */
export function ungroupSelection(
  editor: Editor,
): "dissolved" | "extracted" | "noop" {
  const selected = editor.getSelectedShapes();
  if (selected.length === 0) return "noop";
  const page = editor.getCurrentPageId();
  const figures = selected.filter(isFigure);
  if (figures.length === selected.length) {
    editor.run(() => {
      for (const f of figures) {
        const kids = editor.getSortedChildIdsForParent(f.id);
        if (kids.length) editor.reparentShapes(kids, page);
      }
      editor.deleteShapes(figures.map((f) => f.id));
    });
    return "dissolved";
  }
  const inside = selected.filter((s) =>
    isFigure(editor.getShape(s.parentId as TLShapeId)),
  );
  if (inside.length === 0) return "noop";
  editor.reparentShapes(
    inside.map((s) => s.id),
    page,
  );
  return "extracted";
}

/**
 * Drag a whole figure out of the canvas into a note (e.g. in a project's
 * split view): while a single figure is being moved, the note under the
 * pointer lights up; letting go there embeds the figure and puts it back
 * where it was on the canvas. Returns a cleanup function.
 */
export function enableFigureDragOut(editor: Editor): () => void {
  let zone: Element | null = null;
  const draggedFigureId = () => {
    if (!editor.isIn("select.translating")) return null;
    const selected = editor.getSelectedShapes();
    if (selected.length !== 1 || !isFigure(selected[0])) return null;
    return selected[0].meta?.figureId ?? null;
  };
  const zoneAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest("[data-figure-drop-zone]") ?? null;
  const highlight = (next: Element | null) => {
    if (next === zone) return;
    zone?.removeAttribute("data-figure-drop-active");
    next?.setAttribute("data-figure-drop-active", "true");
    zone = next;
  };

  const onMove = (e: PointerEvent) =>
    highlight(draggedFigureId() ? zoneAt(e.clientX, e.clientY) : null);
  const onUp = (e: PointerEvent) => {
    const figureId = draggedFigureId();
    const target = figureId ? zoneAt(e.clientX, e.clientY) : null;
    highlight(null);
    if (!figureId || !target) return;
    // Let tldraw finish the move, then undo it: the figure stays put on the canvas.
    setTimeout(() => editor.undo(), 0);
    target.dispatchEvent(
      new CustomEvent(FIGURE_DROP_EVENT, {
        detail: { figureId, x: e.clientX, y: e.clientY },
      }),
    );
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  return () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    highlight(null);
  };
}

/* ───────────── Syncing figure images to the API ───────────── */

/** FNV-1a — a cheap fingerprint to skip re-exporting unchanged figures. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function fingerprint(editor: Editor, figure: FigureLike): string {
  const ids = [...editor.getShapeAndDescendantIds([figure.id])].sort();
  const records = ids.map((id) => {
    const s = editor.getShape(id);
    // The figure's own page position doesn't change its picture.
    return s?.id === figure.id ? { ...s, x: 0, y: 0, index: "" } : s;
  });
  return hash(JSON.stringify(records));
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Pushes changed figures (by fingerprint) and deletes removed ones.
 * `known` maps figureId → last synced fingerprint and is updated in place.
 */
export async function syncFigures(
  editor: Editor,
  canvasId: string,
  known: Map<string, string>,
): Promise<void> {
  const figures = editor.getCurrentPageShapes().filter(isFigure);
  const seen = new Set<string>();

  for (const figure of figures) {
    let figureId = figure.meta?.figureId;
    // Copy-pasted figures share an id with their original: give the copy its own.
    if (!figureId || seen.has(figureId)) {
      figureId = generateId("fig");
      editor.updateShape({
        id: figure.id,
        type: FIGURE_TYPE,
        meta: { ...figure.meta, figureId },
      } as never);
    }
    seen.add(figureId);

    const fp = fingerprint(editor, figure);
    if (known.get(figureId) === fp) continue;

    const scale = Math.min(2, MAX_EXPORT_WIDTH / Math.max(1, figure.props.w));
    const { blob } = await editor.toImage([figure.id], {
      format: "png",
      background: true,
      padding: 0,
      scale,
      darkMode: false,
    });
    const body = {
      title: figure.props.label || "Figure",
      width: figure.props.w,
      height: figure.props.h,
      contentHash: fp,
      png: await toBase64(blob),
    };
    try {
      await clientApi.put(`/canvases/${canvasId}/figures/${figureId}`, body);
    } catch (err) {
      // Pasted from another canvas: that id is taken there. Mint a new one and retry once.
      if (!(err instanceof ApiError) || err.status !== 409) throw err;
      figureId = generateId("fig");
      editor.updateShape({
        id: figure.id,
        type: FIGURE_TYPE,
        meta: { ...figure.meta, figureId },
      } as never);
      seen.add(figureId);
      await clientApi.put(`/canvases/${canvasId}/figures/${figureId}`, body);
    }
    known.set(figureId, fp);
  }

  for (const id of [...known.keys()]) {
    if (seen.has(id)) continue;
    await clientApi.delete(`/canvases/${canvasId}/figures/${id}`);
    known.delete(id);
  }
}
