/**
 * Figures on the canvas are octodraw `figure` items (diagram-as-code boxes;
 * octodraw's "To diagram" turns a selection of shapes into one). Notes embed
 * them as PNGs: this keeps each figure's picture in sync with the API
 * (`canvas_figures` rows), and lets a figure be dragged out into a note.
 */
import type { CanvasDocument, FigureItem } from "@octonote/octodraw";
import { figureTitle } from "@octonote/octodraw";
import { clientApi } from "@/lib/api/client-fetch";
export {
  getFigureClientApi,
  listCanvasFiguresClientApi,
  listWorkspaceFiguresClientApi,
  type FigureSummary,
} from "../api/figures-client-api";
import { FIGURE_DROP_EVENT } from "../constants";
import { renderFigurePng } from "./render";

/** Exported figures are capped at this width (px) to keep uploads small. */
const MAX_EXPORT_WIDTH = 1600;

/** The API's figure id format (`fig_<uuid>`). */
const FIGURE_ID = /^fig_[0-9a-f-]{36}$/;

/** FNV-1a — a cheap fingerprint to skip re-exporting unchanged figures. */
function hash(text: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The figure's id in the API and in note embeds. Items already carrying a
 * `fig_` id (converted from older canvases) keep it; others get a stable id
 * derived from canvas + item id, so the same item always maps to the same
 * figure and copies on another canvas never collide.
 */
export function figureApiId(canvasId: string, itemId: string): string {
  if (FIGURE_ID.test(itemId)) return itemId;
  const key = `${canvasId}:${itemId}`;
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => hash(key, seed).toString(16).padStart(8, "0"))
    .join("");
  return `fig_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function figureItems(doc: CanvasDocument): FigureItem[] {
  return doc.items.filter((i): i is FigureItem => i.type === "figure");
}

/** A figure's label: its `title` line, else "Figure". */
export function figureLabel(item: FigureItem): string {
  return figureTitle(item.source)?.trim() || "Figure";
}

function fingerprint(item: FigureItem): string {
  // Only the code and hand placements change the picture, not where it sits.
  return hash(JSON.stringify([item.source, item.placements ?? null])).toString(16);
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Pushes changed figures (by fingerprint). `known` maps figureId → last
 * synced fingerprint and is updated in place; `owned` collects the figure ids
 * this session has seen on the canvas.
 *
 * Only a figure the user removed while editing (it was in `owned` and is
 * gone now) has its row deleted. Rows with no matching item — e.g. figures
 * from canvases drawn before octodraw, whose embeds must keep their last
 * PNG — are never touched.
 */
export async function syncFigures(
  doc: CanvasDocument,
  canvasId: string,
  known: Map<string, string>,
  owned: Set<string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const item of figureItems(doc)) {
    const figureId = figureApiId(canvasId, item.id);
    seen.add(figureId);
    owned.add(figureId);
    const fp = fingerprint(item);
    if (known.get(figureId) === fp) continue;
    const { blob, width, height } = await renderFigurePng(item, MAX_EXPORT_WIDTH);
    await clientApi.put(`/canvases/${canvasId}/figures/${figureId}`, {
      title: figureLabel(item),
      width,
      height,
      contentHash: fp,
      png: await toBase64(blob),
    });
    known.set(figureId, fp);
  }

  for (const id of [...owned]) {
    if (seen.has(id)) continue;
    owned.delete(id);
    if (!known.has(id)) continue;
    await clientApi.delete(`/canvases/${canvasId}/figures/${id}`);
    known.delete(id);
  }
}

/**
 * Drag a whole figure out of the canvas into a note (e.g. in a project's
 * split view): while a single selected figure is being dragged, the note
 * under the pointer lights up; letting go there embeds the figure and calls
 * `onDropped` (the host undoes the move, so the figure stays put on the
 * canvas). Returns a cleanup function.
 */
export function enableFigureDragOut(
  root: HTMLElement,
  draggedFigureId: () => string | null,
  onDropped: () => void,
): () => void {
  let zone: Element | null = null;
  let down = false;
  const zoneAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest("[data-figure-drop-zone]") ?? null;
  const highlight = (next: Element | null) => {
    if (next === zone) return;
    zone?.removeAttribute("data-figure-drop-active");
    next?.setAttribute("data-figure-drop-active", "true");
    zone = next;
  };

  const onDown = (e: PointerEvent) => {
    down = e.button === 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    highlight(draggedFigureId() ? zoneAt(e.clientX, e.clientY) : null);
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    const figureId = draggedFigureId();
    const target = figureId ? zoneAt(e.clientX, e.clientY) : null;
    highlight(null);
    if (!figureId || !target) return;
    // Let the canvas commit the move first, then the host undoes it.
    setTimeout(onDropped, 0);
    target.dispatchEvent(
      new CustomEvent(FIGURE_DROP_EVENT, {
        detail: { figureId, x: e.clientX, y: e.clientY },
      }),
    );
  };
  root.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  return () => {
    root.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    highlight(null);
  };
}
